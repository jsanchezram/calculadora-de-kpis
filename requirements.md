# SaaS Financiero para Empresas de Servicios

## Problema Original
Sistema SaaS para gestión financiera de empresas de servicios con:
- Autenticación JWT
- Gestión de empresas
- Carga de datos financieros (manual y Excel)
- Cálculo automático de KPIs
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
  - `GET /api/summary/{company_id}` - Resumen ejecutivo

### KPIs Calculados
- Margen Neto
- Margen Contribución
- Ratio Costos Fijos
- Liquidez Corriente
- Flujo Operativo
- Punto Equilibrio
- Utilización Personal
- Productividad (Ingreso/Hora)
- ARPU (Ingreso por Cliente)
- Churn Rate
- LTV (Lifetime Value)
- CAC (Costo Adquisición Cliente)

### Frontend (React + Tailwind + Shadcn)
- **Páginas**:
  - Login/Register con validación
  - Dashboard de empresas
  - Dashboard financiero por empresa
- **Características**:
  - Tema oscuro profesional
  - Gráficos interactivos (Recharts)
  - Exportación PDF (jspdf + html2canvas)
  - Upload de Excel
  - Tabla de datos con scroll

## Tecnologías
- Backend: FastAPI, Motor (MongoDB async), PyJWT, Pandas
- Frontend: React 19, TailwindCSS, Shadcn/UI, Recharts
- Base de datos: MongoDB

## Tareas Completadas
- [x] Autenticación JWT completa
- [x] CRUD de empresas
- [x] CRUD de datos financieros
- [x] Cálculo automático de KPIs
- [x] Upload de Excel
- [x] Dashboard con gráficos (líneas y barras)
- [x] Exportación PDF
- [x] UI responsiva oscura
- [x] Toasts de notificación

## Próximos Pasos Sugeridos
1. Agregar comparativas entre periodos
2. Implementar alertas de KPIs fuera de rango
3. Dashboard multi-empresa consolidado
4. Reportes programados por email
5. Integración con contabilidad externa
