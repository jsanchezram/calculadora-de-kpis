from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status, APIRouter
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field, ConfigDict
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_THIS_SECRET_KEY_IN_PRODUCTION")
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
app = FastAPI(title="SaaS Financiero Servicios")

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========== UTILITIES ==========
def to_object_id(id_str: str):
    try:
        return ObjectId(id_str)
    except Exception:
        return None

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

def clean_value(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    return v

async def get_company_or_404(company_id: str, owner_id: str):
    oid = to_object_id(company_id)
    if not oid:
        raise HTTPException(400, "company_id invalido")

    company = await companies_col.find_one({"_id": oid, "owner_id": owner_id})
    if not company:
        raise HTTPException(404, "Empresa no existe o no tienes acceso")
    return company

# ========== KPIs CALCULATION ==========
def safe_div(a: Optional[float], b: Optional[float], ndigits: int = 4):
    if a is None or b in (None, 0):
        return None
    try:
        return round(a / b, ndigits)
    except Exception:
        return None

def calculate_kpis(d: Dict[str, Any]) -> Dict[str, Any]:
    ingresos = d.get("ingresos_netos")
    costos_directos = d.get("costos_directos")
    costos_fijos = d.get("costos_fijos")
    gastos = d.get("gastos_operativos")

    margen_contribucion = ingresos - costos_directos if ingresos is not None and costos_directos is not None else None
    churn = safe_div(d.get("clientes_perdidos"), d.get("clientes_activos"))
    arpu = safe_div(ingresos, d.get("clientes_activos"))

    ltv = round(arpu * (1 / churn), 2) if arpu and churn not in (None, 0) else None
    flujo_operativo = ingresos - costos_directos - gastos if ingresos and costos_directos and gastos else None
    punto_equilibrio_ratio = round(costos_fijos / margen_contribucion, 4) if costos_fijos and margen_contribucion not in (None, 0) else None

    return {
        "margen_neto": safe_div(d.get("utilidad_neta"), ingresos),
        "margen_contribucion": margen_contribucion,
        "ratio_costos_fijos": safe_div(costos_fijos, ingresos),
        "liquidez_corriente": safe_div(d.get("activo_corriente"), d.get("pasivo_corriente")),
        "flujo_operativo": flujo_operativo,
        "punto_equilibrio_ratio": punto_equilibrio_ratio,
        "utilizacion_personal": safe_div(d.get("horas_facturadas"), d.get("horas_disponibles")),
        "productividad_ingreso_por_hora": safe_div(ingresos, d.get("horas_facturadas")),
        "arpu": arpu,
        "churn_rate": churn,
        "ltv": ltv,
        "cac": safe_div(d.get("gasto_comercial"), d.get("clientes_nuevos")),
        "ventas_vs_compras": None if d.get("ventas_netas") is None or d.get("compras_netas") is None else d["ventas_netas"] - d["compras_netas"],
        "resultado_igv": None if d.get("igv_ventas") is None or d.get("igv_compras") is None else d["igv_ventas"] - d["igv_compras"],
    }

# ========== SCHEMAS ==========
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
    period: str = Field(min_length=4, max_length=20)

    ingresos_netos: Optional[float] = None
    costos_directos: Optional[float] = None
    costos_fijos: Optional[float] = None
    gastos_operativos: Optional[float] = None
    utilidad_neta: Optional[float] = None

    activo_corriente: Optional[float] = None
    pasivo_corriente: Optional[float] = None

    clientes_activos: Optional[int] = None
    clientes_nuevos: Optional[int] = None
    clientes_perdidos: Optional[int] = None

    horas_disponibles: Optional[float] = None
    horas_facturadas: Optional[float] = None

    ventas_netas: Optional[float] = None
    compras_netas: Optional[float] = None
    igv_ventas: Optional[float] = None
    igv_compras: Optional[float] = None

    gasto_comercial: Optional[float] = None

class MessageResponse(BaseModel):
    message: str

# ========== ROUTES ==========

@api_router.get("/health")
async def health():
    return {"ok": True}

@api_router.get("/")
async def root():
    return {"message": "SaaS Financiero API"}

# ========== AUTH ==========
@api_router.post("/register", response_model=MessageResponse)
async def register(user: UserCreate):
    existing = await users_col.find_one({"email": user.email})
    if existing:
        raise HTTPException(400, "Usuario ya existe")
    await users_col.insert_one({"email": user.email, "password": hash_password(user.password)})
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

# ========== COMPANIES ==========
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
    return {"message": "Empresa eliminada"}

# ========== FINANCIAL DATA ==========
@api_router.post("/data/{company_id}")
async def add_data(company_id: str, data: FinancialData, me=Depends(get_current_user)):
    await get_company_or_404(company_id, me["_id"])

    record = {k: clean_value(v) for k, v in data.model_dump().items()}
    record.update({
        "company_id": company_id,
        "owner_id": me["_id"],
        "kpis": calculate_kpis(record),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    existing = await data_col.find_one({
        "company_id": company_id, 
        "period": record["period"], 
        "owner_id": me["_id"]
    })
    if existing:
        raise HTTPException(409, "Periodo ya registrado")

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
        "kpis": calculate_kpis(record),
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
    df = pd.read_excel(io.BytesIO(contents))
    df.columns = [c.strip() for c in df.columns]

    if "period" not in df.columns:
        raise HTTPException(400, "El Excel debe tener la columna 'period'")

    results = []
    for _, row in df.iterrows():
        raw = {k: clean_value(v) for k, v in row.to_dict().items()}
        parsed = FinancialData(**raw).model_dump()
        parsed = {k: clean_value(v) for k, v in parsed.items()}
        parsed.update({
            "company_id": company_id,
            "owner_id": me["_id"],
            "kpis": calculate_kpis(parsed),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })

        await data_col.update_one(
            {"company_id": company_id, "period": parsed["period"], "owner_id": me["_id"]},
            {"$set": parsed},
            upsert=True
        )
        results.append(parsed)

    return {"inserted_or_updated": len(results)}

@api_router.get("/dashboard/{company_id}")
async def dashboard(company_id: str, me=Depends(get_current_user)):
    await get_company_or_404(company_id, me["_id"])
    cursor = data_col.find(
        {"company_id": company_id, "owner_id": me["_id"]}, 
        {"_id": 0}
    ).sort("period", 1)
    return await cursor.to_list(1000)

# ========== SUMMARY ==========
@api_router.get("/summary/{company_id}")
async def get_summary(company_id: str, me=Depends(get_current_user)):
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
            "trend": "neutral"
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

# Include router and add middleware
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
