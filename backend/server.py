# =========================================
# SaaS Financiero para Empresas de Servicios
# FastAPI + MongoDB (Motor Async) + JWT + KPIs + Excel + Sales
# ARCHIVO ÚNICO (LINEAL)
# =========================================

# ---------- DEPENDENCIAS ----------
# pip install fastapi uvicorn[standard] python-jose[cryptography] passlib[bcrypt] motor python-multipart pandas openpyxl pydantic[email] python-dotenv

# ---------- ESTRUCTURA EXCEL ESPERADA ----------
# Columnas requeridas (mínimo): period (YYYY-MM)
# Columnas opcionales: ingresos_netos, costos_directos, costos_fijos, gastos_operativos,
# utilidad_neta, utilidad_operativa, activo_corriente, pasivo_corriente, caja_efectivo,
# egresos_totales, clientes_activos, clientes_nuevos, clientes_perdidos, horas_disponibles,
# horas_facturadas, gasto_comercial, ventas_netas, compras_netas, igv_ventas, igv_compras

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status, APIRouter, Query
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from bson import ObjectId
import pandas as pd
import math
import os
import logging
from pathlib import Path
import io
import re

# ---------- CONFIGURACIÓN ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_THIS_SECRET_KEY_IN_PRODUCTION_12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Collections
users_col = db.users
companies_col = db.companies
data_col = db.financial_data
sales_col = db.sales  # ✅ Seguimiento de ventas (REAL): facturada / confirmada

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

# Create the main app
app = FastAPI(title="SaaS Financiero Servicios - KPIs + Sales")

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# =====================================================
# UTILIDADES GENERALES
# =====================================================

_PERIOD_RE = re.compile(r"^\d{4}-\d{2}$")

def is_period(s: str) -> bool:
    """Valida formato YYYY-MM"""
    return bool(s and _PERIOD_RE.match(s))

def to_object_id(id_str: str):
    """Convierte string a ObjectId de MongoDB"""
    try:
        return ObjectId(id_str)
    except Exception:
        return None

def sort_periods(periods: List[str]) -> List[str]:
    """Ordena periodos en formato YYYY-MM correctamente"""
    def period_sort_key(p: str) -> tuple:
        if re.match(r'^\d{4}-\d{2}$', p):
            parts = p.split('-')
            return (int(parts[0]), int(parts[1]), 0)
        elif re.match(r'^\d{4}-Q[1-4]$', p):
            year = int(p[:4])
            quarter = int(p[-1])
            return (year, quarter * 3, 1)
        elif re.match(r'^\d{4}$', p):
            return (int(p), 0, 2)
        return (0, 0, p)
    return sorted(periods, key=period_sort_key)

def clean_value(v):
    """Limpia valores: convierte NaN a None, strings numéricos a números"""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, str):
        v = v.strip()
        if v == '' or v.lower() in ('nan', 'null', 'none', 'na', 'n/a'):
            return None
        try:
            if '.' in v or ',' in v:
                return float(v.replace(',', '.'))
            return int(v)
        except ValueError:
            return v
    return v

def safe_div(a: Optional[float], b: Optional[float], ndigits: int = 4) -> Optional[float]:
    """División segura: retorna None si hay problemas"""
    if a is None or b is None or b == 0:
        return None
    try:
        result = a / b
        if math.isnan(result) or math.isinf(result):
            return None
        return round(result, ndigits)
    except Exception:
        return None

def safe_subtract(a: Optional[float], b: Optional[float]) -> Optional[float]:
    """Resta segura"""
    if a is None or b is None:
        return None
    return a - b

def safe_multiply(a: Optional[float], b: Optional[float], ndigits: int = 2) -> Optional[float]:
    """Multiplicación segura"""
    if a is None or b is None:
        return None
    return round(a * b, ndigits)

def safe_pct_change(current: Optional[float], previous: Optional[float], ndigits: int = 4) -> Optional[float]:
    """Calcula cambio porcentual: (current - previous) / previous"""
    if current is None or previous is None or previous == 0:
        return None
    try:
        result = (current - previous) / abs(previous)
        if math.isnan(result) or math.isinf(result):
            return None
        return round(result, ndigits)
    except Exception:
        return None


# =====================================================
# SEGURIDAD / AUTH
# =====================================================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalido o expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise cred_exc
    except JWTError:
        raise cred_exc

    user = await users_col.find_one({"email": email})
    if not user:
        raise cred_exc

    return {"_id": str(user["_id"]), "email": user["email"]}

async def get_company_or_404(company_id: str, owner_id: str):
    """Valida que la empresa existe y pertenece al usuario"""
    oid = to_object_id(company_id)
    if not oid:
        raise HTTPException(400, "company_id invalido")

    company = await companies_col.find_one({"_id": oid, "owner_id": owner_id})
    if not company:
        raise HTTPException(404, "Empresa no existe o no tienes acceso")
    return company


# =====================================================
# SCHEMAS PYDANTIC
# =====================================================

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)

class CompanyOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str

class FinancialData(BaseModel):
    """Schema de datos financieros por periodo"""
    period: str = Field(min_length=7, max_length=7, description="Periodo en formato YYYY-MM")

    # Base (finanzas)
    ingresos_netos: Optional[float] = Field(None, description="Ingresos totales del periodo")
    costos_directos: Optional[float] = Field(None, description="Costos variables directos")
    costos_fijos: Optional[float] = Field(None, description="Costos fijos del periodo")
    gastos_operativos: Optional[float] = Field(None, description="Gastos de operación")
    utilidad_neta: Optional[float] = Field(None, description="Utilidad neta final")
    utilidad_operativa: Optional[float] = Field(None, description="Utilidad antes de impuestos/intereses")

    # Liquidez y caja
    activo_corriente: Optional[float] = Field(None, description="Activos líquidos")
    pasivo_corriente: Optional[float] = Field(None, description="Pasivos a corto plazo")
    caja_efectivo: Optional[float] = Field(None, description="Efectivo disponible al cierre")
    egresos_totales: Optional[float] = Field(None, description="Total de egresos/salidas del periodo")

    # Clientes
    clientes_activos: Optional[int] = Field(None, description="Clientes activos al cierre")
    clientes_nuevos: Optional[int] = Field(None, description="Nuevos clientes en el periodo")
    clientes_perdidos: Optional[int] = Field(None, description="Clientes perdidos (churn)")

    # Productividad
    horas_disponibles: Optional[float] = Field(None, description="Horas de trabajo disponibles")
    horas_facturadas: Optional[float] = Field(None, description="Horas facturadas a clientes")

    # Adquisición
    gasto_comercial: Optional[float] = Field(None, description="Gasto en adquisición de clientes")

    # Tributario / comercial
    ventas_netas: Optional[float] = Field(None, description="Ventas para cálculo IGV")
    compras_netas: Optional[float] = Field(None, description="Compras para cálculo IGV")
    igv_ventas: Optional[float] = Field(None, description="IGV de ventas")
    igv_compras: Optional[float] = Field(None, description="IGV de compras")

    @field_validator('period')
    @classmethod
    def validate_period(cls, v):
        v = str(v).strip()
        if not is_period(v):
            if re.match(r'^\d{6}$', v):
                v = f"{v[:4]}-{v[4:]}"
            else:
                raise ValueError("period debe ser YYYY-MM")
        return v

class SaleCreate(BaseModel):
    """Schema para registro de ventas"""
    month: str = Field(min_length=7, max_length=7, description="Mes en formato YYYY-MM")
    cliente: str = Field(min_length=2, max_length=120, description="Nombre del cliente")
    monto: float = Field(gt=0, description="Monto de la venta")
    estado: str = Field(default="facturada", description="Estado: facturada | confirmada")
    nota: Optional[str] = Field(None, description="Nota opcional")

    @field_validator('month')
    @classmethod
    def validate_month(cls, v):
        if not is_period(v):
            raise ValueError("month debe ser YYYY-MM")
        return v

    @field_validator('estado')
    @classmethod
    def validate_estado(cls, v):
        v = v.strip().lower()
        if v not in ("facturada", "confirmada"):
            raise ValueError("estado debe ser: facturada | confirmada")
        return v

class MessageResponse(BaseModel):
    message: str


# =====================================================
# CÁLCULO DE KPIs - FUNCIÓN PRINCIPAL
# =====================================================

def calculate_kpis(d: Dict[str, Any], prev_data: Optional[Dict[str, Any]] = None,
                   historical_data: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Calcula TODOS los KPIs financieros para un periodo.
    """
    ingresos = d.get("ingresos_netos")
    costos_directos = d.get("costos_directos")
    costos_fijos = d.get("costos_fijos")
    gastos = d.get("gastos_operativos")
    utilidad_neta = d.get("utilidad_neta")
    utilidad_operativa = d.get("utilidad_operativa")
    activo_corriente = d.get("activo_corriente")
    pasivo_corriente = d.get("pasivo_corriente")
    clientes_activos = d.get("clientes_activos")
    clientes_nuevos = d.get("clientes_nuevos")
    clientes_perdidos = d.get("clientes_perdidos")
    horas_disponibles = d.get("horas_disponibles")
    horas_facturadas = d.get("horas_facturadas")
    gasto_comercial = d.get("gasto_comercial")
    caja = d.get("caja_efectivo")
    egresos_totales = d.get("egresos_totales")

    # ===== RENTABILIDAD =====
    margen_neto = safe_div(utilidad_neta, ingresos)
    
    margen_bruto = None
    margen_contribucion = None
    if ingresos is not None and costos_directos is not None:
        margen_contribucion = ingresos - costos_directos
        margen_bruto = safe_div(margen_contribucion, ingresos)
    
    margen_operativo = safe_div(utilidad_operativa, ingresos)
    if margen_operativo is None and ingresos and costos_directos and gastos:
        util_op_proxy = ingresos - costos_directos - gastos
        margen_operativo = safe_div(util_op_proxy, ingresos)

    ratio_costos_fijos = safe_div(costos_fijos, ingresos)

    # ===== LIQUIDEZ Y FLUJO =====
    liquidez_corriente = safe_div(activo_corriente, pasivo_corriente)
    
    flujo_operativo = None
    if ingresos is not None and costos_directos is not None and gastos is not None:
        flujo_operativo = ingresos - costos_directos - gastos

    punto_equilibrio_ratio = None
    if costos_fijos is not None and margen_contribucion not in (None, 0):
        punto_equilibrio_ratio = round(costos_fijos / margen_contribucion, 4)

    # Burn rate y runway
    burn_rate = None
    runway_meses = None
    if egresos_totales is not None and ingresos is not None:
        burn = egresos_totales - ingresos
        burn_rate = 0 if burn <= 0 else round(burn, 2)

    if caja is not None and burn_rate not in (None, 0):
        runway_meses = round(caja / burn_rate, 2)

    # ARR anualizado
    arr_anualizado = None if ingresos is None else round(ingresos * 12, 2)

    # ===== CLIENTES =====
    churn_rate = safe_div(clientes_perdidos, clientes_activos)
    retencion = None if churn_rate is None else round(1 - churn_rate, 4)
    arpu = safe_div(ingresos, clientes_activos)
    arpu_anualizado = None if arpu is None else round(arpu * 12, 2)

    ltv = None
    if arpu is not None and churn_rate not in (None, 0):
        ltv = round(arpu * (1 / churn_rate), 2)

    # ===== ADQUISICIÓN =====
    cac = safe_div(gasto_comercial, clientes_nuevos)

    ltv_cac = None
    if ltv is not None and cac not in (None, 0):
        ltv_cac = round(ltv / cac, 2)

    payback_cac_meses = None
    if cac is not None and arpu not in (None, 0):
        payback_cac_meses = round(cac / arpu, 2)

    # ===== PRODUCTIVIDAD =====
    utilizacion_personal = safe_div(horas_facturadas, horas_disponibles)
    productividad_ingreso_por_hora = safe_div(ingresos, horas_facturadas)

    # ===== TRIBUTARIO =====
    ventas_vs_compras = safe_subtract(d.get("ventas_netas"), d.get("compras_netas"))
    resultado_igv = safe_subtract(d.get("igv_ventas"), d.get("igv_compras"))

    # ===== COMPARATIVOS (vs periodo anterior) =====
    crecimiento_ingresos_pct = None
    crecimiento_utilidad_pct = None
    variacion_costos_pct = None
    delta_ingresos = None
    delta_utilidad = None

    if prev_data:
        prev_ingresos = prev_data.get("ingresos_netos")
        prev_utilidad = prev_data.get("utilidad_neta")
        prev_costos = prev_data.get("costos_directos")
        
        crecimiento_ingresos_pct = safe_pct_change(ingresos, prev_ingresos)
        delta_ingresos = safe_subtract(ingresos, prev_ingresos)
        crecimiento_utilidad_pct = safe_pct_change(utilidad_neta, prev_utilidad)
        delta_utilidad = safe_subtract(utilidad_neta, prev_utilidad)
        variacion_costos_pct = safe_pct_change(costos_directos, prev_costos)

    # ===== ROLLING / ACUMULADOS =====
    cashflow_acumulado = None
    promedio_ingresos_3m = None

    if historical_data:
        flujos = []
        for h in historical_data:
            h_ingresos = h.get("ingresos_netos")
            h_costos = h.get("costos_directos")
            h_gastos = h.get("gastos_operativos")
            if h_ingresos and h_costos and h_gastos:
                flujos.append(h_ingresos - h_costos - h_gastos)
        
        if flujo_operativo is not None:
            flujos.append(flujo_operativo)
        
        if flujos:
            cashflow_acumulado = round(sum(flujos), 2)
        
        ingresos_list = [h.get("ingresos_netos") for h in historical_data[-2:] if h.get("ingresos_netos")]
        if ingresos is not None:
            ingresos_list.append(ingresos)
        
        if len(ingresos_list) >= 1:
            promedio_ingresos_3m = round(sum(ingresos_list) / len(ingresos_list), 2)

    return {
        # Rentabilidad
        "margen_neto": margen_neto,
        "margen_bruto": margen_bruto,
        "margen_operativo": margen_operativo,
        "margen_contribucion": margen_contribucion,
        "ratio_costos_fijos": ratio_costos_fijos,

        # Liquidez y flujo
        "liquidez_corriente": liquidez_corriente,
        "flujo_operativo": flujo_operativo,
        "burn_rate": burn_rate,
        "runway_meses": runway_meses,
        "arr_anualizado": arr_anualizado,
        "punto_equilibrio_ratio": punto_equilibrio_ratio,

        # Clientes
        "arpu": arpu,
        "arpu_anualizado": arpu_anualizado,
        "churn_rate": churn_rate,
        "retencion": retencion,
        "ltv": ltv,

        # Adquisición
        "cac": cac,
        "ltv_cac": ltv_cac,
        "payback_cac_meses": payback_cac_meses,

        # Productividad
        "utilizacion_personal": utilizacion_personal,
        "productividad_ingreso_por_hora": productividad_ingreso_por_hora,

        # Tributario
        "ventas_vs_compras": ventas_vs_compras,
        "resultado_igv": resultado_igv,

        # Comparativos
        "crecimiento_ingresos_pct": crecimiento_ingresos_pct,
        "crecimiento_utilidad_pct": crecimiento_utilidad_pct,
        "variacion_costos_pct": variacion_costos_pct,
        "delta_ingresos": delta_ingresos,
        "delta_utilidad": delta_utilidad,

        # Rolling
        "cashflow_acumulado": cashflow_acumulado,
        "promedio_ingresos_3m": promedio_ingresos_3m,
    }


def calculate_basic_kpis(d: Dict[str, Any]) -> Dict[str, Any]:
    """Versión simplificada sin datos históricos"""
    return calculate_kpis(d, prev_data=None, historical_data=None)


# =====================================================
# RUTAS API
# =====================================================

@api_router.get("/health")
async def health():
    return {"ok": True}

@api_router.get("/")
async def root():
    return {"message": "SaaS Financiero API - KPIs + Sales"}


# ===== AUTH =====

@api_router.post("/register", response_model=MessageResponse)
async def register(user: UserCreate):
    existing = await users_col.find_one({"email": user.email})
    if existing:
        raise HTTPException(400, "Usuario ya existe")
    await users_col.insert_one({
        "email": user.email, 
        "password": hash_password(user.password),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Usuario creado exitosamente"}

@api_router.post("/login", response_model=TokenOut)
async def login(user: UserLogin):
    db_user = await users_col.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(401, "Credenciales incorrectas")
    token = create_access_token(user.email)
    return {"access_token": token, "token_type": "bearer"}

@api_router.get("/me")
async def get_me(me=Depends(get_current_user)):
    return {"email": me["email"], "id": me["_id"]}


# ===== COMPANIES =====

@api_router.post("/companies", response_model=CompanyOut)
async def create_company(company: CompanyCreate, me=Depends(get_current_user)):
    result = await companies_col.insert_one({
        "name": company.name, 
        "owner_id": me["_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"id": str(result.inserted_id), "name": company.name}

@api_router.get("/companies", response_model=List[CompanyOut])
async def list_companies(me=Depends(get_current_user)):
    items = await companies_col.find({"owner_id": me["_id"]}).to_list(1000)
    return [{"id": str(it["_id"]), "name": it["name"]} for it in items]

@api_router.get("/companies/{company_id}")
async def get_company(company_id: str, me=Depends(get_current_user)):
    company = await get_company_or_404(company_id, me["_id"])
    return {"id": str(company["_id"]), "name": company["name"]}

@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str, me=Depends(get_current_user)):
    await get_company_or_404(company_id, me["_id"])
    await companies_col.delete_one({"_id": to_object_id(company_id), "owner_id": me["_id"]})
    await data_col.delete_many({"company_id": company_id, "owner_id": me["_id"]})
    await sales_col.delete_many({"company_id": company_id, "owner_id": me["_id"]})
    return {"message": "Empresa eliminada"}


# ===== FINANCIAL DATA =====

@api_router.post("/data/{company_id}")
async def add_data(company_id: str, data: FinancialData, me=Depends(get_current_user)):
    await get_company_or_404(company_id, me["_id"])

    record = {k: clean_value(v) for k, v in data.model_dump().items()}
    record.update({
        "company_id": company_id,
        "owner_id": me["_id"],
        "kpis": calculate_basic_kpis(record),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    existing = await data_col.find_one({
        "company_id": company_id, 
        "period": record["period"], 
        "owner_id": me["_id"]
    })
    if existing:
        raise HTTPException(409, "Periodo ya registrado. Use PUT para actualizar.")

    await data_col.insert_one(record)
    record.pop("_id", None)
    return record

@api_router.put("/data/{company_id}/{period}")
async def update_data(company_id: str, period: str, data: FinancialData, me=Depends(get_current_user)):
    await get_company_or_404(company_id, me["_id"])

    record = {k: clean_value(v) for k, v in data.model_dump().items()}
    record.update({
        "company_id": company_id,
        "owner_id": me["_id"],
        "kpis": calculate_basic_kpis(record),
        "updated_at": datetime.now(timezone.utc).isoformat()
    })

    result = await data_col.update_one(
        {"company_id": company_id, "period": period, "owner_id": me["_id"]},
        {"$set": record}
    )
    
    if result.matched_count == 0:
        raise HTTPException(404, "Periodo no encontrado")
    
    return record

@api_router.delete("/data/{company_id}/{period}")
async def delete_data(company_id: str, period: str, me=Depends(get_current_user)):
    await get_company_or_404(company_id, me["_id"])
    result = await data_col.delete_one({
        "company_id": company_id, 
        "period": period, 
        "owner_id": me["_id"]
    })
    if result.deleted_count == 0:
        raise HTTPException(404, "Periodo no encontrado")
    return {"message": "Dato eliminado"}

@api_router.post("/upload/{company_id}")
async def upload_excel(company_id: str, file: UploadFile = File(...), me=Depends(get_current_user)):
    await get_company_or_404(company_id, me["_id"])

    contents = await file.read()
    
    try:
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"Error al leer Excel: {str(e)}")
    
    df.columns = [str(c).strip().lower().replace(' ', '_') for c in df.columns]

    if "period" not in df.columns:
        raise HTTPException(400, "El Excel debe tener la columna 'period' (YYYY-MM)")

    results = []
    errors = []
    
    for idx, row in df.iterrows():
        try:
            raw = {k: clean_value(v) for k, v in row.to_dict().items()}
            valid_fields = set(FinancialData.model_fields.keys())
            filtered = {k: v for k, v in raw.items() if k in valid_fields}
            
            parsed = FinancialData(**filtered).model_dump()
            parsed = {k: clean_value(v) for k, v in parsed.items()}
            
            parsed.update({
                "company_id": company_id,
                "owner_id": me["_id"],
                "kpis": calculate_basic_kpis(parsed),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })

            await data_col.update_one(
                {"company_id": company_id, "period": parsed["period"], "owner_id": me["_id"]},
                {"$set": parsed},
                upsert=True
            )
            results.append(parsed["period"])
            
        except Exception as e:
            errors.append({"row": idx + 2, "error": str(e)})

    return {
        "inserted_or_updated": len(results),
        "periods": results,
        "errors": errors if errors else None
    }


# ===== DASHBOARD ENDPOINTS =====

@api_router.get("/dashboard/{company_id}")
async def dashboard(company_id: str, me=Depends(get_current_user)):
    """Obtener todos los datos con KPIs básicos"""
    await get_company_or_404(company_id, me["_id"])
    
    cursor = data_col.find(
        {"company_id": company_id, "owner_id": me["_id"]}, 
        {"_id": 0}
    )
    data = await cursor.to_list(1000)
    
    if data:
        periods = [d["period"] for d in data]
        sorted_periods = sort_periods(periods)
        data_dict = {d["period"]: d for d in data}
        data = [data_dict[p] for p in sorted_periods]
    
    return data

@api_router.get("/dashboard/{company_id}/range")
async def dashboard_range(
    company_id: str,
    from_period: Optional[str] = Query(default=None, alias="from"),
    to_period: Optional[str] = Query(default=None, alias="to"),
    me=Depends(get_current_user)
):
    """Dashboard con filtro de rango de periodos"""
    await get_company_or_404(company_id, me["_id"])
    
    q = {"company_id": company_id, "owner_id": me["_id"]}

    if from_period:
        if not is_period(from_period):
            raise HTTPException(400, "from debe ser YYYY-MM")
        q["period"] = {"$gte": from_period}

    if to_period:
        if not is_period(to_period):
            raise HTTPException(400, "to debe ser YYYY-MM")
        q.setdefault("period", {})
        q["period"]["$lte"] = to_period

    cursor = data_col.find(q, {"_id": 0})
    records = await cursor.to_list(1000)
    
    if records:
        periods = [r["period"] for r in records]
        sorted_periods = sort_periods(periods)
        data_dict = {r["period"]: r for r in records}
        records = [data_dict[p] for p in sorted_periods]
    
    return records

@api_router.get("/dashboard/{company_id}/summary")
async def dashboard_summary(
    company_id: str,
    me=Depends(get_current_user),
    from_period: Optional[str] = Query(None, alias="from"),
    to_period: Optional[str] = Query(None, alias="to")
):
    """Dashboard completo con KPIs comparativos y acumulados"""
    await get_company_or_404(company_id, me["_id"])
    
    cursor = data_col.find(
        {"company_id": company_id, "owner_id": me["_id"]}, 
        {"_id": 0}
    )
    all_data = await cursor.to_list(1000)
    
    if not all_data:
        return {
            "periods": [],
            "summary": {
                "total_periods": 0,
                "date_range": None,
                "totals": {},
                "averages": {},
                "latest_kpis": {}
            }
        }
    
    periods = [d["period"] for d in all_data]
    sorted_periods = sort_periods(periods)
    data_dict = {d["period"]: d for d in all_data}
    sorted_data = [data_dict[p] for p in sorted_periods]
    
    if from_period or to_period:
        filtered_data = []
        for d in sorted_data:
            p = d["period"]
            if from_period and p < from_period:
                continue
            if to_period and p > to_period:
                continue
            filtered_data.append(d)
        historical_before_filter = [d for d in sorted_data if d["period"] < (from_period or "")]
    else:
        filtered_data = sorted_data
        historical_before_filter = []
    
    result_periods = []
    
    for i, current in enumerate(filtered_data):
        if i > 0:
            prev_data = filtered_data[i - 1]
        elif historical_before_filter:
            prev_data = historical_before_filter[-1]
        else:
            prev_data = None
        
        historical = historical_before_filter + filtered_data[:i]
        full_kpis = calculate_kpis(current, prev_data, historical)
        period_record = {**current, "kpis": full_kpis}
        result_periods.append(period_record)
    
    total_ingresos = sum(d.get("ingresos_netos", 0) or 0 for d in filtered_data)
    total_utilidad = sum(d.get("utilidad_neta", 0) or 0 for d in filtered_data)
    total_costos = sum(d.get("costos_directos", 0) or 0 for d in filtered_data)
    
    ingresos_list = [d.get("ingresos_netos") for d in filtered_data if d.get("ingresos_netos")]
    avg_ingresos = sum(ingresos_list) / len(ingresos_list) if ingresos_list else None
    
    margins = [d.get("kpis", {}).get("margen_neto") for d in result_periods if d.get("kpis", {}).get("margen_neto") is not None]
    avg_margin = sum(margins) / len(margins) if margins else None
    
    latest = result_periods[-1] if result_periods else {}
    latest_kpis = latest.get("kpis", {})
    
    trend = "neutral"
    if len(result_periods) >= 2:
        current_revenue = result_periods[-1].get("ingresos_netos", 0) or 0
        previous_revenue = result_periods[-2].get("ingresos_netos", 0) or 0
        if current_revenue > previous_revenue:
            trend = "up"
        elif current_revenue < previous_revenue:
            trend = "down"
    
    return {
        "periods": result_periods,
        "summary": {
            "total_periods": len(result_periods),
            "date_range": {
                "from": result_periods[0]["period"] if result_periods else None,
                "to": result_periods[-1]["period"] if result_periods else None
            },
            "totals": {
                "ingresos": round(total_ingresos, 2),
                "utilidad": round(total_utilidad, 2),
                "costos": round(total_costos, 2)
            },
            "averages": {
                "ingresos_promedio": round(avg_ingresos, 2) if avg_ingresos else None,
                "margen_neto_promedio": round(avg_margin, 4) if avg_margin else None
            },
            "trend": trend,
            "latest_period": latest.get("period"),
            "latest_kpis": latest_kpis
        }
    }

@api_router.get("/summary/{company_id}")
async def get_summary(company_id: str, me=Depends(get_current_user)):
    """Resumen ejecutivo simple"""
    await get_company_or_404(company_id, me["_id"])
    
    data = await data_col.find(
        {"company_id": company_id, "owner_id": me["_id"]},
        {"_id": 0}
    ).sort("period", -1).to_list(1000)
    
    if not data:
        return {
            "total_periods": 0,
            "latest_period": None,
            "total_revenue": 0,
            "avg_margin": None,
            "trend": "neutral",
            "latest_kpis": {}
        }
    
    latest = data[0] if data else {}
    total_revenue = sum(d.get("ingresos_netos", 0) or 0 for d in data)
    margins = [d.get("kpis", {}).get("margen_neto") for d in data if d.get("kpis", {}).get("margen_neto") is not None]
    avg_margin = sum(margins) / len(margins) if margins else None
    
    trend = "neutral"
    if len(data) >= 2:
        current_revenue = data[0].get("ingresos_netos", 0) or 0
        previous_revenue = data[1].get("ingresos_netos", 0) or 0
        if current_revenue > previous_revenue:
            trend = "up"
        elif current_revenue < previous_revenue:
            trend = "down"
    
    return {
        "total_periods": len(data),
        "latest_period": latest.get("period"),
        "total_revenue": total_revenue,
        "avg_margin": avg_margin,
        "trend": trend,
        "latest_kpis": latest.get("kpis", {})
    }


# ===== SALES (VENTAS REALES) =====

@api_router.post("/sales/{company_id}")
async def add_sale(company_id: str, sale: SaleCreate, me=Depends(get_current_user)):
    """Registrar una venta (facturada o confirmada)"""
    await get_company_or_404(company_id, me["_id"])

    doc = sale.model_dump()
    doc.update({
        "company_id": company_id,
        "owner_id": me["_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await sales_col.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/sales/{company_id}")
async def list_sales(company_id: str, me=Depends(get_current_user)):
    """Listar todas las ventas de una empresa"""
    await get_company_or_404(company_id, me["_id"])
    cursor = sales_col.find(
        {"company_id": company_id, "owner_id": me["_id"]}, 
        {"_id": 0}
    ).sort("month", 1)
    items = await cursor.to_list(1000)
    return items

@api_router.get("/sales/{company_id}/summary")
async def sales_summary(company_id: str, me=Depends(get_current_user)):
    """Resumen de ventas agrupado por mes"""
    await get_company_or_404(company_id, me["_id"])
    
    cursor = sales_col.find(
        {"company_id": company_id, "owner_id": me["_id"]}, 
        {"_id": 0}
    )
    items = await cursor.to_list(1000)
    
    by_month = {}
    for it in items:
        m = it.get("month")
        if not m:
            continue
        by_month.setdefault(m, {"month": m, "facturada": 0.0, "confirmada": 0.0})
        estado = it.get("estado")
        monto = float(it.get("monto") or 0)
        if estado in ("facturada", "confirmada"):
            by_month[m][estado] += monto

    out = list(by_month.values())
    out.sort(key=lambda x: x["month"])
    return out

@api_router.delete("/sales/{company_id}/{sale_id}")
async def delete_sale(company_id: str, sale_id: str, me=Depends(get_current_user)):
    """Eliminar una venta"""
    await get_company_or_404(company_id, me["_id"])
    oid = to_object_id(sale_id)
    if not oid:
        raise HTTPException(400, "sale_id invalido")
    
    result = await sales_col.delete_one({
        "_id": oid,
        "company_id": company_id, 
        "owner_id": me["_id"]
    })
    if result.deleted_count == 0:
        raise HTTPException(404, "Venta no encontrada")
    return {"message": "Venta eliminada"}


# ===== KPI METADATA =====

@api_router.get("/kpis/metadata")
async def get_kpis_metadata():
    """Descripción de todos los KPIs con reglas de semáforo"""
    return {
        "kpis": [
            # Rentabilidad (con semáforo)
            {"key": "margen_neto", "title": "Margen Neto", "unit": "pct", "formula": "utilidad_neta / ingresos", "rule": {"type": "high_good", "redMax": 0.05, "yellowMax": 0.15}},
            {"key": "margen_bruto", "title": "Margen Bruto", "unit": "pct", "formula": "(ingresos - costos_directos) / ingresos", "rule": {"type": "high_good", "redMax": 0.20, "yellowMax": 0.35}},
            {"key": "margen_operativo", "title": "Margen Operativo", "unit": "pct", "formula": "utilidad_operativa / ingresos", "rule": {"type": "high_good", "redMax": 0.08, "yellowMax": 0.15}},
            {"key": "margen_contribucion", "title": "Margen Contribución", "unit": "money", "formula": "ingresos - costos_directos"},
            {"key": "ratio_costos_fijos", "title": "Ratio Costos Fijos", "unit": "pct", "formula": "costos_fijos / ingresos"},

            # Liquidez (con semáforo)
            {"key": "liquidez_corriente", "title": "Liquidez Corriente", "unit": "ratio", "formula": "activo_corriente / pasivo_corriente", "rule": {"type": "high_good", "redMax": 1.0, "yellowMax": 1.5}},
            {"key": "flujo_operativo", "title": "Flujo Operativo", "unit": "money", "formula": "ingresos - costos_directos - gastos"},
            {"key": "burn_rate", "title": "Burn Rate", "unit": "money", "formula": "egresos - ingresos (si > 0)"},
            {"key": "runway_meses", "title": "Runway", "unit": "months", "formula": "caja / burn_rate", "rule": {"type": "high_good", "redMax": 3.0, "yellowMax": 6.0}},
            {"key": "arr_anualizado", "title": "ARR (anualizado)", "unit": "money", "formula": "ingresos * 12"},
            {"key": "punto_equilibrio_ratio", "title": "Punto Equilibrio", "unit": "pct", "formula": "costos_fijos / margen_contribucion"},

            # Clientes (con semáforo)
            {"key": "arpu", "title": "ARPU", "unit": "money", "formula": "ingresos / clientes_activos"},
            {"key": "arpu_anualizado", "title": "ARPU anualizado", "unit": "money", "formula": "arpu * 12"},
            {"key": "churn_rate", "title": "Churn Rate", "unit": "pct", "formula": "clientes_perdidos / clientes_activos", "rule": {"type": "low_good", "greenMax": 0.05, "yellowMax": 0.10}},
            {"key": "retencion", "title": "Retención", "unit": "pct", "formula": "1 - churn_rate", "rule": {"type": "high_good", "redMax": 0.80, "yellowMax": 0.90}},
            {"key": "ltv", "title": "LTV", "unit": "money", "formula": "arpu / churn_rate"},

            # Adquisición (con semáforo)
            {"key": "cac", "title": "CAC", "unit": "money", "formula": "gasto_comercial / clientes_nuevos"},
            {"key": "ltv_cac", "title": "LTV/CAC", "unit": "ratio", "formula": "ltv / cac", "rule": {"type": "high_good", "redMax": 2.0, "yellowMax": 3.0}},
            {"key": "payback_cac_meses", "title": "Payback CAC", "unit": "months", "formula": "cac / arpu", "rule": {"type": "low_good", "greenMax": 3.0, "yellowMax": 6.0}},

            # Productividad
            {"key": "utilizacion_personal", "title": "Utilización personal", "unit": "pct", "formula": "horas_facturadas / horas_disponibles"},
            {"key": "productividad_ingreso_por_hora", "title": "Productividad (S/ por hora)", "unit": "money", "formula": "ingresos / horas_facturadas"},

            # Tributario
            {"key": "ventas_vs_compras", "title": "Ventas vs Compras", "unit": "money", "formula": "ventas_netas - compras_netas"},
            {"key": "resultado_igv", "title": "Resultado IGV", "unit": "money", "formula": "igv_ventas - igv_compras"},

            # Comparativos
            {"key": "crecimiento_ingresos_pct", "title": "Crecimiento Ingresos", "unit": "pct", "formula": "(actual - anterior) / anterior"},
            {"key": "crecimiento_utilidad_pct", "title": "Crecimiento Utilidad", "unit": "pct", "formula": "(actual - anterior) / anterior"},
            {"key": "variacion_costos_pct", "title": "Variación Costos", "unit": "pct", "formula": "(actual - anterior) / anterior"},

            # Rolling
            {"key": "cashflow_acumulado", "title": "Cashflow Acumulado", "unit": "money", "formula": "suma(flujos_operativos)"},
            {"key": "promedio_ingresos_3m", "title": "Promedio 3M", "unit": "money", "formula": "promedio(ingresos, 3 periodos)"},
        ]
    }


# =====================================================
# CONFIGURACIÓN FINAL
# =====================================================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
