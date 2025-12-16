# SaaS Financiero para Empresas de Servicios

## Problema Original
Sistema SaaS para gestión financiera de empresas de servicios con:
- Autenticación JWT
- Gestión de empresas
- Carga de datos financieros (manual y Excel)
- Cálculo automático de KPIs completos
- Dashboard con visualizaciones
- Exportación a PDF

## Arquitectura Implementada

### Backend (FastAPI + MongoDB)
- **Autenticación**: JWT con bcrypt para passwords
- **Endpoints**:
  - `POST /api/register` - Registro de usuarios
  - `POST /api/login` - Login y token JWT
  - `GET /api/me` - Usuario actual
  - `POST /api/companies` - Crear empresa
  - `GET /api/companies` - Listar empresas
  - `DELETE /api/companies/{id}` - Eliminar empresa
  - `POST /api/data/{company_id}` - Agregar datos financieros
  - `PUT /api/data/{company_id}/{period}` - Actualizar datos
  - `DELETE /api/data/{company_id}/{period}` - Eliminar periodo
  - `POST /api/upload/{company_id}` - Cargar Excel
  - `GET /api/dashboard/{company_id}` - Dashboard con KPIs
  - `GET /api/dashboard/{company_id}/summary?from=YYYY-MM&to=YYYY-MM` - **NUEVO** Dashboard completo con filtros
  - `GET /api/summary/{company_id}` - Resumen ejecutivo
  - `GET /api/kpis/metadata` - **NUEVO** Descripción de todos los KPIs

### KPIs Calculados (28 Total)

**Rentabilidad:**
- margen_neto (utilidad_neta / ingresos)
- margen_bruto ((ingresos - costos_directos) / ingresos)
- margen_operativo (utilidad_operativa / ingresos)
- margen_contribucion (ingresos - costos_directos)

**Costos:**
- ratio_costos_fijos (costos_fijos / ingresos)
- punto_equilibrio_ratio (costos_fijos / margen_contribucion)

**Liquidez:**
- liquidez_corriente (activo_corriente / pasivo_corriente)
- flujo_operativo (ingresos - costos_directos - gastos_operativos)

**Productividad:**
- utilizacion_personal (horas_facturadas / horas_disponibles)
- productividad_ingreso_por_hora (ingresos / horas_facturadas)

**Clientes:**
- arpu (ingresos / clientes_activos)
- arpu_anualizado (arpu * 12)
- churn_rate (clientes_perdidos / clientes_activos)
- retencion_clientes (1 - churn_rate)
- ltv (arpu / churn_rate)
- cac (gasto_comercial / clientes_nuevos)
- ratio_ltv_cac (ltv / cac)
- payback_cac_meses (cac / arpu)

**IGV:**
- ventas_vs_compras (ventas_netas - compras_netas)
- resultado_igv (igv_ventas - igv_compras)

**Cash/Runway:**
- burn_rate (egresos_totales)
- runway_meses (caja / burn_rate)
- ingresos_anualizados (ingresos * 12)

**Comparativos (vs periodo anterior):**
- crecimiento_ingresos_pct
- crecimiento_utilidad_pct
- variacion_costos_pct

**Rolling/Acumulados:**
- cashflow_acumulado (suma histórica de flujos)
- promedio_ingresos_3m (promedio últimos 3 periodos)

### Campos de Datos Financieros
```
period              | str   | Formato YYYY-MM (requerido)
ingresos_netos      | float | Ingresos totales del periodo
costos_directos     | float | Costos variables directos
costos_fijos        | float | Costos fijos del periodo
gastos_operativos   | float | Gastos de operación
utilidad_neta       | float | Utilidad neta final
utilidad_operativa  | float | Utilidad antes de impuestos/intereses
activo_corriente    | float | Activos líquidos
pasivo_corriente    | float | Pasivos a corto plazo
clientes_activos    | int   | Clientes activos al cierre
clientes_nuevos     | int   | Nuevos clientes en el periodo
clientes_perdidos   | int   | Clientes perdidos (churn)
horas_disponibles   | float | Horas de trabajo disponibles
horas_facturadas    | float | Horas facturadas a clientes
ventas_netas        | float | Ventas para cálculo IGV
compras_netas       | float | Compras para cálculo IGV
igv_ventas          | float | IGV de ventas
igv_compras         | float | IGV de compras
gasto_comercial     | float | Gasto en adquisición de clientes
caja                | float | Efectivo disponible al cierre
egresos_totales     | float | Total de egresos/salidas del periodo
```

### Frontend (React + Tailwind + Shadcn)
- **Páginas**:
  - Login/Register con validación
  - Dashboard de empresas
  - Dashboard financiero por empresa con secciones organizadas
- **Secciones KPIs**:
  - Rentabilidad
  - Liquidez y Flujo
  - Clientes
  - Adquisición
  - Productividad
  - Crecimiento (comparativos)
- **Características**:
  - Tema oscuro profesional
  - Gráficos interactivos (Recharts): Líneas, Áreas, Barras
  - Gráfico de Cashflow Acumulado
  - Exportación PDF
  - Upload de Excel con validación por fila
  - Filtro por rango de periodos
  - Tabla de datos con scroll

## Tecnologías
- Backend: FastAPI, Motor (MongoDB async), PyJWT, Pandas, Openpyxl
- Frontend: React 19, TailwindCSS, Shadcn/UI, Recharts, jsPDF
- Base de datos: MongoDB

## Tareas Completadas
- [x] Autenticación JWT completa
- [x] CRUD de empresas
- [x] CRUD de datos financieros con nuevos campos
- [x] Cálculo automático de 28 KPIs
- [x] Upload de Excel con soporte NaN/strings
- [x] Dashboard con gráficos (líneas, barras, áreas)
- [x] Gráfico de Cashflow Acumulado
- [x] KPIs comparativos vs periodo anterior
- [x] KPIs rolling (promedio 3M, cashflow acumulado)
- [x] Endpoint /dashboard/summary con filtros from/to
- [x] Endpoint /kpis/metadata
- [x] Exportación PDF
- [x] UI con secciones organizadas de KPIs

## Próximos Pasos Sugeridos
1. Implementar alertas de KPIs fuera de rango
2. Dashboard multi-empresa consolidado
3. Reportes programados por email
4. Proyecciones y forecasting
5. Integración con contabilidad externa
