# =========================================
# SaaS Financiero para Empresas de Servicios
# FastAPI + MongoDB (Motor Async) + JWT + KPIs Completos
# ARCHIVO ÚNICO (LINEAL)
# =========================================

# ---------- DEPENDENCIAS ----------
# pip install fastapi uvicorn[standard] python-jose[cryptography] passlib[bcrypt] motor python-multipart pandas openpyxl pydantic[email] python-dotenv

# ---------- ESTRUCTURA EXCEL ESPERADA ----------
# Columnas requeridas (mínimo): period
# Columnas opcionales (todas numéricas excepto period):
#   period              | str   | Formato YYYY-MM (ej: 2024-01)
#   ingresos_netos      | float | Ingresos totales del periodo
#   costos_directos     | float | Costos variables directos
#   costos_fijos        | float | Costos fijos del periodo
#   gastos_operativos   | float | Gastos de operación
#   utilidad_neta       | float | Utilidad neta final
#   utilidad_operativa  | float | Utilidad antes de impuestos/intereses
#   activo_corriente    | float | Activos líquidos
#   pasivo_corriente    | float | Pasivos a corto plazo
#   clientes_activos    | int   | Clientes activos al cierre
#   clientes_nuevos     | int   | Nuevos clientes en el periodo
#   clientes_perdidos   | int   | Clientes perdidos (churn)
#   horas_disponibles   | float | Horas de trabajo disponibles
#   horas_facturadas    | float | Horas facturadas a clientes
#   ventas_netas        | float | Ventas para cálculo IGV
#   compras_netas       | float | Compras para cálculo IGV
#   igv_ventas          | float | IGV de ventas
#   igv_compras         | float | IGV de compras
#   gasto_comercial     | float | Gasto en adquisición de clientes
#   caja                | float | Efectivo disponible al cierre
#   egresos_totales     | float | Total de egresos/salidas del periodo

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

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

# Create the main app
app = FastAPI(title="SaaS Financiero Servicios - KPIs Completos")

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# =====================================================
# UTILIDADES GENERALES
# =====================================================

def to_object_id(id_str: str):
    """Convierte string a ObjectId de MongoDB"""
    try:
        return ObjectId(id_str)
    except Exception:
        return None


def sort_periods(periods: List[str]) -> List[str]:
    """
    Ordena periodos en formato YYYY-MM correctamente.
    Soporta: YYYY-MM, YYYY-Q1, YYYY (anual)
    """
    def period_sort_key(p: str) -> tuple:
        # Formato YYYY-MM
        if re.match(r'^\d{4}-\d{2}$', p):
            parts = p.split('-')
            return (int(parts[0]), int(parts[1]), 0)
        # Formato YYYY-Q1/Q2/Q3/Q4
        elif re.match(r'^\d{4}-Q[1-4]$', p):
            year = int(p[:4])
            quarter = int(p[-1])
            return (year, quarter * 3, 1)
        # Formato YYYY (anual)
        elif re.match(r'^\d{4}$', p):
            return (int(p), 0, 2)
        # Otros formatos
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
        # Intentar convertir string numérico
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
    """
    Schema de datos financieros por periodo.
    Todos los campos numéricos son opcionales para permitir carga parcial.
    """
    period: str = Field(min_length=4, max_length=20, description="Periodo en formato YYYY-MM")

    # Ingresos y costos
    ingresos_netos: Optional[float] = Field(None, description="Ingresos totales del periodo")
    costos_directos: Optional[float] = Field(None, description="Costos variables directos")
    costos_fijos: Optional[float] = Field(None, description="Costos fijos del periodo")
    gastos_operativos: Optional[float] = Field(None, description="Gastos de operación")
    utilidad_neta: Optional[float] = Field(None, description="Utilidad neta final")
    utilidad_operativa: Optional[float] = Field(None, description="Utilidad antes de impuestos/intereses")

    # Balance
    activo_corriente: Optional[float] = Field(None, description="Activos líquidos")
    pasivo_corriente: Optional[float] = Field(None, description="Pasivos a corto plazo")

    # Clientes
    clientes_activos: Optional[int] = Field(None, description="Clientes activos al cierre")
    clientes_nuevos: Optional[int] = Field(None, description="Nuevos clientes en el periodo")
    clientes_perdidos: Optional[int] = Field(None, description="Clientes perdidos (churn)")

    # Productividad
    horas_disponibles: Optional[float] = Field(None, description="Horas de trabajo disponibles")
    horas_facturadas: Optional[float] = Field(None, description="Horas facturadas a clientes")

    # IGV/Impuestos
    ventas_netas: Optional[float] = Field(None, description="Ventas para cálculo IGV")
    compras_netas: Optional[float] = Field(None, description="Compras para cálculo IGV")
    igv_ventas: Optional[float] = Field(None, description="IGV de ventas")
    igv_compras: Optional[float] = Field(None, description="IGV de compras")

    # Comercial
    gasto_comercial: Optional[float] = Field(None, description="Gasto en adquisición de clientes")

    # Cash/Flujo (nuevos campos para burn_rate y runway)
    caja: Optional[float] = Field(None, description="Efectivo disponible al cierre del periodo")
    egresos_totales: Optional[float] = Field(None, description="Total de egresos/salidas del periodo")

    @field_validator('period')
    @classmethod
    def validate_period(cls, v):
        v = str(v).strip()
        # Validar formatos comunes
        if not re.match(r'^(\d{4}-\d{2}|\d{4}-Q[1-4]|\d{4})$', v):
            # Intentar normalizar formatos alternativos
            if re.match(r'^\d{6}$', v):  # 202401 -> 2024-01
                v = f"{v[:4]}-{v[4:]}"
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
    
    Args:
        d: Datos del periodo actual
        prev_data: Datos del periodo anterior (para comparativos)
        historical_data: Lista de periodos anteriores ordenados (para rolling/acumulados)
    
    Returns:
        Dict con todos los KPIs calculados
    """
    
    # Extraer valores base
    ingresos = d.get("ingresos_netos")
    costos_directos = d.get("costos_directos")
    costos_fijos = d.get("costos_fijos")
    gastos_op = d.get("gastos_operativos")
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
    caja = d.get("caja")
    egresos_totales = d.get("egresos_totales")
    
    # ===== KPIs BÁSICOS =====
    
    # margen_neto: utilidad_neta / ingresos_netos
    # Indica qué porcentaje de los ingresos queda como ganancia neta
    margen_neto = safe_div(utilidad_neta, ingresos)
    
    # margen_contribucion: ingresos_netos - costos_directos (valor absoluto)
    # Margen disponible para cubrir costos fijos y generar utilidad
    margen_contribucion = safe_subtract(ingresos, costos_directos)
    
    # margen_bruto: (ingresos - costos_directos) / ingresos
    # Porcentaje de margen después de costos directos
    margen_bruto = safe_div(margen_contribucion, ingresos) if margen_contribucion else None
    
    # margen_operativo: utilidad_operativa / ingresos (o proxy)
    # Si no hay utilidad_operativa, usar: ingresos - costos_directos - gastos_operativos
    if utilidad_operativa is not None:
        margen_operativo = safe_div(utilidad_operativa, ingresos)
    elif ingresos and costos_directos and gastos_op:
        util_op_proxy = ingresos - costos_directos - gastos_op
        margen_operativo = safe_div(util_op_proxy, ingresos)
    else:
        margen_operativo = None
    
    # ratio_costos_fijos: costos_fijos / ingresos
    # Qué porcentaje de ingresos se destina a costos fijos
    ratio_costos_fijos = safe_div(costos_fijos, ingresos)
    
    # liquidez_corriente: activo_corriente / pasivo_corriente
    # Capacidad de pagar deudas a corto plazo (>1 es saludable)
    liquidez_corriente = safe_div(activo_corriente, pasivo_corriente)
    
    # flujo_operativo: ingresos - costos_directos - gastos_operativos
    # Cash generado por operaciones
    flujo_operativo = None
    if ingresos is not None and costos_directos is not None and gastos_op is not None:
        flujo_operativo = ingresos - costos_directos - gastos_op
    
    # punto_equilibrio_ratio: costos_fijos / margen_contribucion
    # Porcentaje de capacidad necesario para cubrir costos fijos
    punto_equilibrio_ratio = safe_div(costos_fijos, margen_contribucion) if margen_contribucion and margen_contribucion != 0 else None
    
    # ===== KPIs DE PRODUCTIVIDAD =====
    
    # utilizacion_personal: horas_facturadas / horas_disponibles
    # Eficiencia en uso del tiempo del equipo
    utilizacion_personal = safe_div(horas_facturadas, horas_disponibles)
    
    # productividad_ingreso_por_hora: ingresos / horas_facturadas
    # Ingreso generado por hora de trabajo facturada
    productividad_ingreso_por_hora = safe_div(ingresos, horas_facturadas)
    
    # ===== KPIs DE CLIENTES =====
    
    # churn_rate: clientes_perdidos / clientes_activos
    # Tasa de pérdida de clientes
    churn_rate = safe_div(clientes_perdidos, clientes_activos)
    
    # retencion_clientes: 1 - churn_rate
    # Porcentaje de clientes retenidos
    retencion_clientes = (1 - churn_rate) if churn_rate is not None else None
    
    # arpu: ingresos / clientes_activos
    # Ingreso promedio por usuario/cliente (mensual)
    arpu = safe_div(ingresos, clientes_activos)
    
    # arpu_anualizado: arpu * 12
    # ARPU proyectado a un año
    arpu_anualizado = safe_multiply(arpu, 12)
    
    # ltv: arpu / churn_rate (si churn > 0)
    # Valor del cliente en su tiempo de vida
    ltv = None
    if arpu is not None and churn_rate is not None and churn_rate > 0:
        ltv = round(arpu / churn_rate, 2)
    
    # cac: gasto_comercial / clientes_nuevos
    # Costo de adquirir un nuevo cliente
    cac = safe_div(gasto_comercial, clientes_nuevos)
    
    # ratio_ltv_cac: ltv / cac
    # Relación valor de cliente vs costo de adquisición (>3 es bueno)
    ratio_ltv_cac = safe_div(ltv, cac)
    
    # payback_cac_meses: cac / arpu
    # Meses para recuperar el costo de adquisición
    # También puede calcularse como: cac / (margen_contribucion / clientes_activos)
    payback_cac_meses = safe_div(cac, arpu)
    
    # ===== KPIs DE IGV =====
    
    # ventas_vs_compras: ventas_netas - compras_netas
    ventas_vs_compras = safe_subtract(d.get("ventas_netas"), d.get("compras_netas"))
    
    # resultado_igv: igv_ventas - igv_compras
    resultado_igv = safe_subtract(d.get("igv_ventas"), d.get("igv_compras"))
    
    # ===== KPIs DE CASH / RUNWAY =====
    
    # burn_rate: egresos_totales del periodo
    # Tasa de consumo de efectivo mensual
    burn_rate = egresos_totales
    
    # runway_meses: caja / burn_rate
    # Meses de operación con el efectivo disponible
    runway_meses = safe_div(caja, burn_rate)
    
    # ingresos_anualizados (ARR proxy): ingresos * 12
    # Proyección de ingresos anuales basado en el periodo
    ingresos_anualizados = safe_multiply(ingresos, 12)
    
    # ===== KPIs COMPARATIVOS (vs periodo anterior) =====
    
    crecimiento_ingresos_pct = None
    crecimiento_utilidad_pct = None
    variacion_costos_pct = None
    delta_ingresos = None
    delta_utilidad = None
    delta_costos = None
    
    if prev_data:
        prev_ingresos = prev_data.get("ingresos_netos")
        prev_utilidad = prev_data.get("utilidad_neta")
        prev_costos = prev_data.get("costos_directos")
        
        # crecimiento_ingresos_pct: (actual - anterior) / anterior
        crecimiento_ingresos_pct = safe_pct_change(ingresos, prev_ingresos)
        delta_ingresos = safe_subtract(ingresos, prev_ingresos)
        
        # crecimiento_utilidad_pct: cambio en utilidad neta
        crecimiento_utilidad_pct = safe_pct_change(utilidad_neta, prev_utilidad)
        delta_utilidad = safe_subtract(utilidad_neta, prev_utilidad)
        
        # variacion_costos_pct: cambio en costos directos
        variacion_costos_pct = safe_pct_change(costos_directos, prev_costos)
        delta_costos = safe_subtract(costos_directos, prev_costos)
    
    # ===== KPIs ROLLING / ACUMULADOS =====
    
    cashflow_acumulado = None
    promedio_ingresos_3m = None
    
    if historical_data:
        # cashflow_acumulado: suma de flujos operativos históricos
        flujos = []
        for h in historical_data:
            h_ingresos = h.get("ingresos_netos")
            h_costos = h.get("costos_directos")
            h_gastos = h.get("gastos_operativos")
            if h_ingresos and h_costos and h_gastos:
                flujos.append(h_ingresos - h_costos - h_gastos)
        
        # Agregar periodo actual
        if flujo_operativo is not None:
            flujos.append(flujo_operativo)
        
        if flujos:
            cashflow_acumulado = round(sum(flujos), 2)
        
        # promedio_ingresos_3m: promedio de últimos 3 periodos (incluyendo actual)
        ingresos_list = [h.get("ingresos_netos") for h in historical_data[-2:] if h.get("ingresos_netos")]
        if ingresos is not None:
            ingresos_list.append(ingresos)
        
        if len(ingresos_list) >= 1:
            promedio_ingresos_3m = round(sum(ingresos_list) / len(ingresos_list), 2)
    
    # ===== RETORNAR TODOS LOS KPIs =====
    
    return {
        # Rentabilidad
        "margen_neto": margen_neto,
        "margen_bruto": margen_bruto,
        "margen_operativo": margen_operativo,
        "margen_contribucion": margen_contribucion,
        
        # Costos
        "ratio_costos_fijos": ratio_costos_fijos,
        "punto_equilibrio_ratio": punto_equilibrio_ratio,
        
        # Liquidez
        "liquidez_corriente": liquidez_corriente,
        "flujo_operativo": flujo_operativo,
        
        # Productividad
        "utilizacion_personal": utilizacion_personal,
        "productividad_ingreso_por_hora": productividad_ingreso_por_hora,
        
        # Clientes
        "arpu": arpu,
        "arpu_anualizado": arpu_anualizado,
        "churn_rate": churn_rate,
        "retencion_clientes": retencion_clientes,
        "ltv": ltv,
        "cac": cac,
        "ratio_ltv_cac": ratio_ltv_cac,
        "payback_cac_meses": payback_cac_meses,
        
        # IGV
        "ventas_vs_compras": ventas_vs_compras,
        "resultado_igv": resultado_igv,
        
        # Cash / Runway
        "burn_rate": burn_rate,
        "runway_meses": runway_meses,
        "ingresos_anualizados": ingresos_anualizados,
        
        # Comparativos (vs periodo anterior)
        "crecimiento_ingresos_pct": crecimiento_ingresos_pct,
        "crecimiento_utilidad_pct": crecimiento_utilidad_pct,
        "variacion_costos_pct": variacion_costos_pct,
        "delta_ingresos": delta_ingresos,
        "delta_utilidad": delta_utilidad,
        "delta_costos": delta_costos,
        
        # Rolling / Acumulados
        "cashflow_acumulado": cashflow_acumulado,
        "promedio_ingresos_3m": promedio_ingresos_3m,
    }


def calculate_basic_kpis(d: Dict[str, Any]) -> Dict[str, Any]:
    """
    Versión simplificada para cálculos sin datos históricos.
    Usada en inserción individual de datos.
    """
    return calculate_kpis(d, prev_data=None, historical_data=None)


# =====================================================
# RUTAS API
# =====================================================

@api_router.get("/health")
async def health():
    return {"ok": True}


@api_router.get("/")
async def root():
    return {"message": "SaaS Financiero API - KPIs Completos"}


# ===== AUTH =====

@api_router.post("/register", response_model=MessageResponse)
async def register(user: UserCreate):
    """Registrar nuevo usuario"""
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
    """Login y obtener token JWT"""
    db_user = await users_col.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(401, "Credenciales incorrectas")
    token = create_access_token(user.email)
    return {"access_token": token, "token_type": "bearer"}


@api_router.get("/me")
async def get_me(me=Depends(get_current_user)):
    """Obtener usuario actual"""
    return {"email": me["email"], "id": me["_id"]}


# ===== COMPANIES =====

@api_router.post("/companies", response_model=CompanyOut)
async def create_company(company: CompanyCreate, me=Depends(get_current_user)):
    """Crear nueva empresa"""
    result = await companies_col.insert_one({
        "name": company.name, 
        "owner_id": me["_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"id": str(result.inserted_id), "name": company.name}


@api_router.get("/companies", response_model=List[CompanyOut])
async def list_companies(me=Depends(get_current_user)):
    """Listar empresas del usuario"""
    items = await companies_col.find({"owner_id": me["_id"]}).to_list(1000)
    return [{"id": str(it["_id"]), "name": it["name"]} for it in items]


@api_router.get("/companies/{company_id}")
async def get_company(company_id: str, me=Depends(get_current_user)):
    """Obtener empresa por ID"""
    company = await get_company_or_404(company_id, me["_id"])
    return {"id": str(company["_id"]), "name": company["name"]}


@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str, me=Depends(get_current_user)):
    """Eliminar empresa y todos sus datos"""
    await get_company_or_404(company_id, me["_id"])
    await companies_col.delete_one({"_id": to_object_id(company_id), "owner_id": me["_id"]})
    await data_col.delete_many({"company_id": company_id, "owner_id": me["_id"]})
    return {"message": "Empresa eliminada"}


# ===== FINANCIAL DATA =====

@api_router.post("/data/{company_id}")
async def add_data(company_id: str, data: FinancialData, me=Depends(get_current_user)):
    """
    Agregar datos financieros de un periodo.
    Calcula KPIs básicos automáticamente.
    """
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
    """Actualizar datos de un periodo existente"""
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
    """Eliminar datos de un periodo"""
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
    """
    Cargar datos desde archivo Excel.
    - Soporta NaN, strings numéricos, columnas extra
    - Valida cada fila con Pydantic
    - Hace upsert por (company_id, owner_id, period)
    """
    await get_company_or_404(company_id, me["_id"])

    contents = await file.read()
    
    try:
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"Error al leer Excel: {str(e)}")
    
    # Normalizar nombres de columnas
    df.columns = [str(c).strip().lower().replace(' ', '_') for c in df.columns]

    if "period" not in df.columns:
        raise HTTPException(400, "El Excel debe tener la columna 'period'")

    results = []
    errors = []
    
    for idx, row in df.iterrows():
        try:
            # Limpiar valores
            raw = {k: clean_value(v) for k, v in row.to_dict().items()}
            
            # Filtrar solo campos válidos del schema
            valid_fields = set(FinancialData.model_fields.keys())
            filtered = {k: v for k, v in raw.items() if k in valid_fields}
            
            # Validar con Pydantic
            parsed = FinancialData(**filtered).model_dump()
            parsed = {k: clean_value(v) for k, v in parsed.items()}
            
            parsed.update({
                "company_id": company_id,
                "owner_id": me["_id"],
                "kpis": calculate_basic_kpis(parsed),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })

            # Upsert
            await data_col.update_one(
                {"company_id": company_id, "period": parsed["period"], "owner_id": me["_id"]},
                {"$set": parsed},
                upsert=True
            )
            results.append(parsed["period"])
            
        except Exception as e:
            errors.append({"row": idx + 2, "error": str(e)})  # +2 por header y 0-index

    return {
        "inserted_or_updated": len(results),
        "periods": results,
        "errors": errors if errors else None
    }


# ===== DASHBOARD ENDPOINTS =====

@api_router.get("/dashboard/{company_id}")
async def dashboard(company_id: str, me=Depends(get_current_user)):
    """
    Obtener todos los datos con KPIs básicos.
    Ordenados por periodo ascendente.
    """
    await get_company_or_404(company_id, me["_id"])
    
    cursor = data_col.find(
        {"company_id": company_id, "owner_id": me["_id"]}, 
        {"_id": 0}
    )
    data = await cursor.to_list(1000)
    
    # Ordenar por periodo
    if data:
        periods = [d["period"] for d in data]
        sorted_periods = sort_periods(periods)
        data_dict = {d["period"]: d for d in data}
        data = [data_dict[p] for p in sorted_periods]
    
    return data


@api_router.get("/dashboard/{company_id}/summary")
async def dashboard_summary(
    company_id: str,
    me=Depends(get_current_user),
    from_period: Optional[str] = Query(None, alias="from", description="Periodo inicial YYYY-MM"),
    to_period: Optional[str] = Query(None, alias="to", description="Periodo final YYYY-MM")
):
    """
    Dashboard completo con KPIs comparativos y acumulados.
    
    Retorna:
    - Lista de periodos con todos los KPIs
    - KPIs comparativos (delta y delta_pct vs periodo previo)
    - KPIs acumulados/rolling (cashflow_acumulado, promedio_ingresos_3m)
    
    Parámetros opcionales:
    - from: Filtrar desde periodo (YYYY-MM)
    - to: Filtrar hasta periodo (YYYY-MM)
    """
    await get_company_or_404(company_id, me["_id"])
    
    # Obtener todos los datos
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
    
    # Ordenar por periodo
    periods = [d["period"] for d in all_data]
    sorted_periods = sort_periods(periods)
    data_dict = {d["period"]: d for d in all_data}
    sorted_data = [data_dict[p] for p in sorted_periods]
    
    # Filtrar por rango si se especifica
    if from_period or to_period:
        filtered_data = []
        for d in sorted_data:
            p = d["period"]
            if from_period and p < from_period:
                continue
            if to_period and p > to_period:
                continue
            filtered_data.append(d)
        
        # Mantener histórico completo para cálculos rolling
        historical_before_filter = [d for d in sorted_data if d["period"] < (from_period or "")]
    else:
        filtered_data = sorted_data
        historical_before_filter = []
    
    # Recalcular KPIs con datos comparativos y acumulados
    result_periods = []
    
    for i, current in enumerate(filtered_data):
        # Obtener periodo anterior
        if i > 0:
            prev_data = filtered_data[i - 1]
        elif historical_before_filter:
            prev_data = historical_before_filter[-1]
        else:
            prev_data = None
        
        # Obtener histórico para rolling
        historical = historical_before_filter + filtered_data[:i]
        
        # Calcular KPIs completos
        full_kpis = calculate_kpis(current, prev_data, historical)
        
        # Crear registro con KPIs actualizados
        period_record = {**current, "kpis": full_kpis}
        result_periods.append(period_record)
    
    # Calcular resumen general
    total_ingresos = sum(d.get("ingresos_netos", 0) or 0 for d in filtered_data)
    total_utilidad = sum(d.get("utilidad_neta", 0) or 0 for d in filtered_data)
    total_costos = sum(d.get("costos_directos", 0) or 0 for d in filtered_data)
    
    # Promedios
    ingresos_list = [d.get("ingresos_netos") for d in filtered_data if d.get("ingresos_netos")]
    avg_ingresos = sum(ingresos_list) / len(ingresos_list) if ingresos_list else None
    
    margins = [d.get("kpis", {}).get("margen_neto") for d in result_periods if d.get("kpis", {}).get("margen_neto") is not None]
    avg_margin = sum(margins) / len(margins) if margins else None
    
    # Último periodo y sus KPIs
    latest = result_periods[-1] if result_periods else {}
    latest_kpis = latest.get("kpis", {})
    
    # Tendencia general
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
    """
    Resumen ejecutivo simple (compatible con versión anterior).
    Para dashboard completo use /dashboard/{company_id}/summary
    """
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
    
    # Calculate trend
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


# ===== KPI METADATA =====

@api_router.get("/kpis/metadata")
async def get_kpis_metadata():
    """
    Obtener descripción de todos los KPIs disponibles.
    Útil para documentación y tooltips en frontend.
    """
    return {
        "kpis": [
            # Rentabilidad
            {"key": "margen_neto", "name": "Margen Neto", "formula": "utilidad_neta / ingresos_netos", "unit": "percent", "description": "Porcentaje de ingresos que queda como ganancia neta"},
            {"key": "margen_bruto", "name": "Margen Bruto", "formula": "(ingresos - costos_directos) / ingresos", "unit": "percent", "description": "Margen después de costos directos"},
            {"key": "margen_operativo", "name": "Margen Operativo", "formula": "utilidad_operativa / ingresos", "unit": "percent", "description": "Margen antes de impuestos e intereses"},
            {"key": "margen_contribucion", "name": "Margen Contribución", "formula": "ingresos - costos_directos", "unit": "currency", "description": "Margen disponible para cubrir costos fijos"},
            
            # Costos
            {"key": "ratio_costos_fijos", "name": "Ratio Costos Fijos", "formula": "costos_fijos / ingresos", "unit": "percent", "description": "Porcentaje de ingresos destinado a costos fijos"},
            {"key": "punto_equilibrio_ratio", "name": "Punto Equilibrio", "formula": "costos_fijos / margen_contribucion", "unit": "percent", "description": "Capacidad necesaria para cubrir costos fijos"},
            
            # Liquidez
            {"key": "liquidez_corriente", "name": "Liquidez Corriente", "formula": "activo_corriente / pasivo_corriente", "unit": "ratio", "description": "Capacidad de pagar deudas corto plazo (>1 saludable)"},
            {"key": "flujo_operativo", "name": "Flujo Operativo", "formula": "ingresos - costos_directos - gastos_operativos", "unit": "currency", "description": "Cash generado por operaciones"},
            
            # Productividad
            {"key": "utilizacion_personal", "name": "Utilización Personal", "formula": "horas_facturadas / horas_disponibles", "unit": "percent", "description": "Eficiencia en uso del tiempo del equipo"},
            {"key": "productividad_ingreso_por_hora", "name": "Ingreso por Hora", "formula": "ingresos / horas_facturadas", "unit": "currency", "description": "Ingreso por hora facturada"},
            
            # Clientes
            {"key": "arpu", "name": "ARPU", "formula": "ingresos / clientes_activos", "unit": "currency", "description": "Ingreso promedio por cliente (mensual)"},
            {"key": "arpu_anualizado", "name": "ARPU Anualizado", "formula": "arpu * 12", "unit": "currency", "description": "ARPU proyectado a un año"},
            {"key": "churn_rate", "name": "Churn Rate", "formula": "clientes_perdidos / clientes_activos", "unit": "percent", "description": "Tasa de pérdida de clientes"},
            {"key": "retencion_clientes", "name": "Retención", "formula": "1 - churn_rate", "unit": "percent", "description": "Porcentaje de clientes retenidos"},
            {"key": "ltv", "name": "LTV", "formula": "arpu / churn_rate", "unit": "currency", "description": "Valor del cliente en su tiempo de vida"},
            {"key": "cac", "name": "CAC", "formula": "gasto_comercial / clientes_nuevos", "unit": "currency", "description": "Costo de adquirir un nuevo cliente"},
            {"key": "ratio_ltv_cac", "name": "LTV/CAC", "formula": "ltv / cac", "unit": "ratio", "description": "Valor cliente vs costo adquisición (>3 bueno)"},
            {"key": "payback_cac_meses", "name": "Payback CAC", "formula": "cac / arpu", "unit": "months", "description": "Meses para recuperar costo de adquisición"},
            
            # IGV
            {"key": "ventas_vs_compras", "name": "Ventas vs Compras", "formula": "ventas_netas - compras_netas", "unit": "currency", "description": "Diferencia entre ventas y compras netas"},
            {"key": "resultado_igv", "name": "Resultado IGV", "formula": "igv_ventas - igv_compras", "unit": "currency", "description": "IGV a pagar/recuperar"},
            
            # Cash / Runway
            {"key": "burn_rate", "name": "Burn Rate", "formula": "egresos_totales", "unit": "currency", "description": "Consumo de efectivo mensual"},
            {"key": "runway_meses", "name": "Runway", "formula": "caja / burn_rate", "unit": "months", "description": "Meses de operación con efectivo disponible"},
            {"key": "ingresos_anualizados", "name": "ARR (proxy)", "formula": "ingresos * 12", "unit": "currency", "description": "Proyección de ingresos anuales"},
            
            # Comparativos
            {"key": "crecimiento_ingresos_pct", "name": "Crecimiento Ingresos", "formula": "(actual - anterior) / anterior", "unit": "percent", "description": "Variación de ingresos vs periodo anterior"},
            {"key": "crecimiento_utilidad_pct", "name": "Crecimiento Utilidad", "formula": "(actual - anterior) / anterior", "unit": "percent", "description": "Variación de utilidad vs periodo anterior"},
            {"key": "variacion_costos_pct", "name": "Variación Costos", "formula": "(actual - anterior) / anterior", "unit": "percent", "description": "Variación de costos vs periodo anterior"},
            
            # Rolling
            {"key": "cashflow_acumulado", "name": "Cashflow Acumulado", "formula": "suma(flujos_operativos)", "unit": "currency", "description": "Suma de flujos operativos históricos"},
            {"key": "promedio_ingresos_3m", "name": "Promedio 3M", "formula": "promedio(ingresos, 3 periodos)", "unit": "currency", "description": "Promedio de ingresos últimos 3 periodos"},
        ]
    }


# =====================================================
# CONFIGURACIÓN FINAL
# =====================================================

# Include router
app.include_router(api_router)

# CORS Middleware
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


# =====================================================
# EJEMPLO DE USO (comentado)
# =====================================================
"""
# 1. Registrar usuario
POST /api/register
{"email": "usuario@empresa.com", "password": "MiPassword123"}

# 2. Login
POST /api/login
{"email": "usuario@empresa.com", "password": "MiPassword123"}
# Response: {"access_token": "eyJ...", "token_type": "bearer"}

# 3. Crear empresa
POST /api/companies
Headers: Authorization: Bearer eyJ...
{"name": "Mi Empresa de Servicios"}

# 4. Cargar datos (Excel o manual)
POST /api/upload/{company_id}
Headers: Authorization: Bearer eyJ...
Body: form-data con file=archivo.xlsx

# 5. Dashboard con KPIs completos
GET /api/dashboard/{company_id}/summary?from=2024-01&to=2024-12
Headers: Authorization: Bearer eyJ...

# Response incluye:
# - periods: lista con cada periodo y sus KPIs completos
# - summary: totales, promedios, tendencia, último periodo
"""
