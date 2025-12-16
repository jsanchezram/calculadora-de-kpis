# SaaS Financiero para Empresas de Servicios - COMPLETO

## Resumen
Sistema SaaS completo para gestión financiera con KPIs, semáforos, ventas y dashboards interactivos.

## Arquitectura

### Backend (FastAPI + MongoDB) - Archivo único: `/app/backend/server.py`

**Endpoints:**
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
- `GET /api/dashboard/{company_id}` - Dashboard básico
- `GET /api/dashboard/{company_id}/range?from=YYYY-MM&to=YYYY-MM` - Dashboard con filtros
- `GET /api/dashboard/{company_id}/summary` - Dashboard completo con KPIs comparativos
- `GET /api/summary/{company_id}` - Resumen ejecutivo
- `GET /api/kpis/metadata` - Descripción de KPIs con reglas semáforo
- `POST /api/sales/{company_id}` - Registrar venta
- `GET /api/sales/{company_id}` - Listar ventas
- `GET /api/sales/{company_id}/summary` - Resumen ventas por mes

### KPIs con Semáforos

**Con semáforo (high_good - mayor es mejor):**
- margen_neto: Crítico < 5%, Atención 5-15%, Saludable > 15%
- margen_bruto: Crítico < 20%, Atención 20-35%, Saludable > 35%
- margen_operativo: Crítico < 8%, Atención 8-15%, Saludable > 15%
- liquidez_corriente: Crítico < 1.0, Atención 1.0-1.5, Saludable > 1.5
- retencion: Crítico < 80%, Atención 80-90%, Saludable > 90%
- ltv_cac: Crítico < 2.0, Atención 2.0-3.0, Saludable > 3.0
- runway_meses: Crítico < 3, Atención 3-6, Saludable > 6

**Con semáforo (low_good - menor es mejor):**
- churn_rate: Saludable ≤ 5%, Atención 5-10%, Crítico > 10%
- payback_cac_meses: Saludable ≤ 3, Atención 3-6, Crítico > 6

**Sin semáforo (informativos):**
- arpu, arpu_anualizado, ltv, cac, burn_rate, flujo_operativo
- arr_anualizado, margen_contribucion, punto_equilibrio_ratio
- utilizacion_personal, productividad_ingreso_por_hora
- ventas_vs_compras, resultado_igv
- crecimiento_ingresos_pct, crecimiento_utilidad_pct, variacion_costos_pct
- cashflow_acumulado, promedio_ingresos_3m

### Sistema de Ventas

Estados permitidos:
- `facturada` - Venta con factura emitida
- `confirmada` - Venta con pago confirmado

### Frontend (React + Tailwind + Shadcn)

**Archivos clave:**
- `/app/frontend/src/lib/kpiMeta.js` - Metadata y reglas de semáforo
- `/app/frontend/src/components/KpiCard.jsx` - Tarjeta KPI clickeable
- `/app/frontend/src/pages/KpiDetailPage.jsx` - Detalle de KPI con historial
- `/app/frontend/src/components/SalesPanel.jsx` - Panel de ventas

**Funcionalidades:**
- KPIs organizados por secciones (Rentabilidad, Liquidez, Clientes, etc.)
- Semáforos visuales (verde/amarillo/rojo)
- Click en KpiCard navega a página de detalle
- Página de detalle con gráfico histórico, estadísticas y reglas
- Panel de ventas con gráfico de barras
- Filtros por rango de periodos
- Exportación a PDF

## Campos de Datos Financieros
```
period              | str   | YYYY-MM (requerido)
ingresos_netos      | float | Ingresos totales
costos_directos     | float | Costos variables
costos_fijos        | float | Costos fijos
gastos_operativos   | float | Gastos operación
utilidad_neta       | float | Utilidad final
utilidad_operativa  | float | EBIT
activo_corriente    | float | Activos líquidos
pasivo_corriente    | float | Pasivos corto plazo
caja_efectivo       | float | Efectivo disponible
egresos_totales     | float | Total egresos
clientes_activos    | int   | Clientes al cierre
clientes_nuevos     | int   | Nuevos clientes
clientes_perdidos   | int   | Clientes perdidos
horas_disponibles   | float | Horas disponibles
horas_facturadas    | float | Horas facturadas
gasto_comercial     | float | Gasto adquisición
```

## Testing
- Backend: 100% (26/26 tests)
- Frontend: 80-95% (funcional, issues menores de automatización)

## Próximos Pasos Sugeridos
1. Alertas automáticas cuando KPIs estén en zona crítica
2. Proyecciones y forecasting con ML
3. Dashboard multi-empresa consolidado
4. Reportes programados por email
5. Integración con sistemas contables externos
