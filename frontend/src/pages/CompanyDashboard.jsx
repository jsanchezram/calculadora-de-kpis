import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCompany, getDashboardSummary, addData, deleteData, uploadExcel } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ScrollArea } from '../components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  ArrowLeft, Plus, Upload, Download, TrendingUp, TrendingDown, 
  DollarSign, Users, Clock, Target, Percent, Activity,
  FileSpreadsheet, Trash2, LogOut, Wallet, BarChart3, Calculator,
  ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, Area, AreaChart
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// KPI Card Component
const KPICard = ({ title, value, icon: Icon, trend, trendValue, format = 'number', color = 'primary', description }) => {
  const formatValue = (val) => {
    if (val === null || val === undefined) return 'N/A';
    if (format === 'percent') return `${(val * 100).toFixed(2)}%`;
    if (format === 'currency') return `S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
    if (format === 'decimal') return val.toFixed(4);
    if (format === 'months') return `${val.toFixed(1)} meses`;
    if (format === 'ratio') return val.toFixed(2);
    return val.toLocaleString('es-PE');
  };

  const colorClasses = {
    primary: 'text-primary',
    blue: 'text-blue-500',
    yellow: 'text-yellow-500',
    red: 'text-red-500',
    purple: 'text-purple-500',
    cyan: 'text-cyan-500',
    orange: 'text-orange-500',
    pink: 'text-pink-500',
  };

  const getTrendIcon = () => {
    if (trendValue === null || trendValue === undefined) return null;
    if (trendValue > 0) return <ArrowUpRight className="w-3 h-3 text-green-500" />;
    if (trendValue < 0) return <ArrowDownRight className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const getTrendColor = () => {
    if (trendValue === null || trendValue === undefined) return '';
    if (trendValue > 0) return 'text-green-500';
    if (trendValue < 0) return 'text-red-500';
    return 'text-muted-foreground';
  };

  return (
    <Card className="bg-[#121214] border-white/10 card-glow h-full hover:border-white/20 transition-all">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className={`w-8 h-8 rounded-lg bg-secondary flex items-center justify-center ${colorClasses[color]}`}>
            <Icon className="w-4 h-4" />
          </div>
          {trendValue !== undefined && trendValue !== null && (
            <div className={`flex items-center gap-1 text-xs ${getTrendColor()}`}>
              {getTrendIcon()}
              <span>{(trendValue * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
        <p className="kpi-label mb-1 text-[10px]">{title}</p>
        <p className="kpi-value text-xl">{formatValue(value)}</p>
        {description && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">{description}</p>
        )}
      </CardContent>
    </Card>
  );
};

// KPI Section Component
const KPISection = ({ title, children }) => (
  <div className="mb-6">
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {children}
    </div>
  </div>
);

export default function CompanyDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const dashboardRef = useRef(null);
  
  const [company, setCompany] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [fromPeriod, setFromPeriod] = useState('');
  const [toPeriod, setToPeriod] = useState('');
  const [formData, setFormData] = useState({
    period: '',
    ingresos_netos: '',
    costos_directos: '',
    costos_fijos: '',
    gastos_operativos: '',
    utilidad_neta: '',
    utilidad_operativa: '',
    activo_corriente: '',
    pasivo_corriente: '',
    clientes_activos: '',
    clientes_nuevos: '',
    clientes_perdidos: '',
    horas_disponibles: '',
    horas_facturadas: '',
    ventas_netas: '',
    compras_netas: '',
    igv_ventas: '',
    igv_compras: '',
    gasto_comercial: '',
    caja: '',
    egresos_totales: '',
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [companyRes, summaryRes] = await Promise.all([
        getCompany(id),
        getDashboardSummary(id, fromPeriod || null, toPeriod || null),
      ]);
      setCompany(companyRes.data);
      setDashboardData(summaryRes.data);
    } catch (err) {
      toast.error('Error al cargar datos');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = async () => {
    setLoading(true);
    try {
      const summaryRes = await getDashboardSummary(id, fromPeriod || null, toPeriod || null);
      setDashboardData(summaryRes.data);
    } catch (err) {
      toast.error('Error al filtrar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitData = async (e) => {
    e.preventDefault();
    const payload = {};
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== '') {
        payload[key] = key === 'period' ? value : parseFloat(value);
      }
    });

    try {
      await addData(id, payload);
      toast.success('Datos agregados exitosamente');
      setDialogOpen(false);
      setFormData({
        period: '', ingresos_netos: '', costos_directos: '', costos_fijos: '',
        gastos_operativos: '', utilidad_neta: '', utilidad_operativa: '', activo_corriente: '', 
        pasivo_corriente: '', clientes_activos: '', clientes_nuevos: '', clientes_perdidos: '', 
        horas_disponibles: '', horas_facturadas: '', ventas_netas: '', compras_netas: '', 
        igv_ventas: '', igv_compras: '', gasto_comercial: '', caja: '', egresos_totales: '',
      });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al agregar datos');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const res = await uploadExcel(id, file);
      toast.success(`${res.data.inserted_or_updated} periodos procesados`);
      if (res.data.errors?.length) {
        toast.warning(`${res.data.errors.length} filas con errores`);
      }
      setUploadDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al procesar archivo');
    }
  };

  const handleDeletePeriod = async (period) => {
    if (!window.confirm(`Eliminar datos del periodo "${period}"?`)) return;
    try {
      await deleteData(id, period);
      toast.success('Periodo eliminado');
      loadData();
    } catch (err) {
      toast.error('Error al eliminar periodo');
    }
  };

  const exportToPDF = async () => {
    if (!dashboardRef.current) return;
    
    toast.info('Generando PDF...');
    try {
      const canvas = await html2canvas(dashboardRef.current, {
        backgroundColor: '#09090b',
        scale: 2,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${company?.name || 'reporte'}_dashboard.pdf`);
      toast.success('PDF descargado');
    } catch (err) {
      toast.error('Error al generar PDF');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  const periods = dashboardData?.periods || [];
  const summary = dashboardData?.summary || {};
  const latestKpis = summary.latest_kpis || {};
  
  // Prepare chart data
  const chartData = periods.map((d) => ({
    period: d.period,
    ingresos: d.ingresos_netos || 0,
    costos: d.costos_directos || 0,
    utilidad: d.utilidad_neta || 0,
    margen: d.kpis?.margen_neto ? d.kpis.margen_neto * 100 : 0,
    flujo: d.kpis?.flujo_operativo || 0,
    cashflow_acum: d.kpis?.cashflow_acumulado || 0,
  }));

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="glass sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate('/dashboard')}
                data-testid="back-btn"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-bold tracking-tight">{company?.name}</h1>
                <p className="text-xs text-muted-foreground">Dashboard Financiero Completo</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Period Filter */}
              <div className="hidden md:flex items-center gap-2 mr-4">
                <Input
                  placeholder="Desde (2024-01)"
                  value={fromPeriod}
                  onChange={(e) => setFromPeriod(e.target.value)}
                  className="w-32 h-8 text-xs bg-zinc-900/50 border-white/10"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  placeholder="Hasta (2024-12)"
                  value={toPeriod}
                  onChange={(e) => setToPeriod(e.target.value)}
                  className="w-32 h-8 text-xs bg-zinc-900/50 border-white/10"
                />
                <Button size="sm" variant="outline" onClick={handleFilterChange} className="h-8 border-white/10">
                  Filtrar
                </Button>
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportToPDF}
                className="border-white/10 h-8"
                data-testid="export-pdf-btn"
              >
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="border-white/10 h-8" data-testid="upload-excel-btn">
                    <Upload className="w-4 h-4 mr-1" />
                    Excel
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#121214] border-white/10" aria-describedby="upload-excel-description">
                  <DialogHeader>
                    <DialogTitle>Cargar Excel</DialogTitle>
                  </DialogHeader>
                  <p id="upload-excel-description" className="sr-only">Sube un archivo Excel con datos financieros</p>
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground mb-4">
                      Columnas: period (requerido), ingresos_netos, costos_directos, costos_fijos, 
                      gastos_operativos, utilidad_neta, clientes_activos, clientes_nuevos, 
                      clientes_perdidos, caja, egresos_totales, etc.
                    </p>
                    <Input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="bg-zinc-900/50 border-white/10"
                      data-testid="excel-file-input"
                    />
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90 glow-green h-8" size="sm" data-testid="add-data-btn">
                    <Plus className="w-4 h-4 mr-1" />
                    Datos
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#121214] border-white/10 max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="add-data-description">
                  <DialogHeader>
                    <DialogTitle>Agregar Datos Financieros</DialogTitle>
                    <p id="add-data-description" className="text-sm text-muted-foreground">
                      Registra los datos financieros de un periodo
                    </p>
                  </DialogHeader>
                  <form onSubmit={handleSubmitData} className="mt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-3">
                        <Label className="text-xs">Periodo * (YYYY-MM)</Label>
                        <Input name="period" placeholder="2024-01" value={formData.period} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" data-testid="period-input" required />
                      </div>
                      
                      {/* Ingresos y Costos */}
                      <div>
                        <Label className="text-xs">Ingresos Netos</Label>
                        <Input name="ingresos_netos" type="number" step="0.01" value={formData.ingresos_netos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" data-testid="ingresos-input" />
                      </div>
                      <div>
                        <Label className="text-xs">Costos Directos</Label>
                        <Input name="costos_directos" type="number" step="0.01" value={formData.costos_directos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Costos Fijos</Label>
                        <Input name="costos_fijos" type="number" step="0.01" value={formData.costos_fijos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Gastos Operativos</Label>
                        <Input name="gastos_operativos" type="number" step="0.01" value={formData.gastos_operativos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Utilidad Neta</Label>
                        <Input name="utilidad_neta" type="number" step="0.01" value={formData.utilidad_neta} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Utilidad Operativa</Label>
                        <Input name="utilidad_operativa" type="number" step="0.01" value={formData.utilidad_operativa} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>

                      {/* Balance */}
                      <div>
                        <Label className="text-xs">Activo Corriente</Label>
                        <Input name="activo_corriente" type="number" step="0.01" value={formData.activo_corriente} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Pasivo Corriente</Label>
                        <Input name="pasivo_corriente" type="number" step="0.01" value={formData.pasivo_corriente} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>

                      {/* Clientes */}
                      <div>
                        <Label className="text-xs">Clientes Activos</Label>
                        <Input name="clientes_activos" type="number" value={formData.clientes_activos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Clientes Nuevos</Label>
                        <Input name="clientes_nuevos" type="number" value={formData.clientes_nuevos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Clientes Perdidos</Label>
                        <Input name="clientes_perdidos" type="number" value={formData.clientes_perdidos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>

                      {/* Productividad */}
                      <div>
                        <Label className="text-xs">Horas Disponibles</Label>
                        <Input name="horas_disponibles" type="number" step="0.01" value={formData.horas_disponibles} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Horas Facturadas</Label>
                        <Input name="horas_facturadas" type="number" step="0.01" value={formData.horas_facturadas} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Gasto Comercial</Label>
                        <Input name="gasto_comercial" type="number" step="0.01" value={formData.gasto_comercial} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>

                      {/* Cash */}
                      <div>
                        <Label className="text-xs">Caja (Efectivo)</Label>
                        <Input name="caja" type="number" step="0.01" value={formData.caja} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Egresos Totales</Label>
                        <Input name="egresos_totales" type="number" step="0.01" value={formData.egresos_totales} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                    </div>
                    <Button type="submit" className="w-full bg-primary hover:bg-primary/90" data-testid="submit-data-btn">
                      Guardar Datos
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleLogout}
                className="h-8 w-8"
                data-testid="logout-btn"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4" ref={dashboardRef}>
        {periods.length === 0 ? (
          <Card className="bg-[#121214] border-white/10 card-glow">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileSpreadsheet className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sin datos financieros</h3>
              <p className="text-muted-foreground text-center mb-4">
                Agrega datos manualmente o carga un archivo Excel
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setDialogOpen(true)} className="bg-primary hover:bg-primary/90">
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Datos
                </Button>
                <Button variant="outline" onClick={() => setUploadDialogOpen(true)} className="border-white/10">
                  <Upload className="w-4 h-4 mr-2" />
                  Cargar Excel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Bar */}
            <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-[#121214] rounded-lg border border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Periodos:</span>
                <span className="font-mono text-sm">{summary.total_periods}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rango:</span>
                <span className="font-mono text-sm">{summary.date_range?.from} - {summary.date_range?.to}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Ingresos Total:</span>
                <span className="font-mono text-sm text-primary">S/ {summary.totals?.ingresos?.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Tendencia:</span>
                {summary.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
                {summary.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
                {summary.trend === 'neutral' && <Minus className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {/* KPIs Grid */}
            <KPISection title="Rentabilidad">
              <KPICard title="Margen Neto" value={latestKpis.margen_neto} icon={Percent} format="percent" color="primary" trendValue={latestKpis.crecimiento_utilidad_pct} />
              <KPICard title="Margen Bruto" value={latestKpis.margen_bruto} icon={Percent} format="percent" color="blue" />
              <KPICard title="Margen Operativo" value={latestKpis.margen_operativo} icon={Percent} format="percent" color="cyan" />
              <KPICard title="Margen Contribucion" value={latestKpis.margen_contribucion} icon={DollarSign} format="currency" color="yellow" />
              <KPICard title="ARR (Anualizado)" value={latestKpis.ingresos_anualizados} icon={TrendingUp} format="currency" color="primary" />
            </KPISection>

            <KPISection title="Liquidez y Flujo">
              <KPICard title="Liquidez Corriente" value={latestKpis.liquidez_corriente} icon={Activity} format="decimal" color="blue" description=">1 es saludable" />
              <KPICard title="Flujo Operativo" value={latestKpis.flujo_operativo} icon={TrendingUp} format="currency" color="primary" />
              <KPICard title="Cashflow Acumulado" value={latestKpis.cashflow_acumulado} icon={Wallet} format="currency" color="cyan" />
              <KPICard title="Burn Rate" value={latestKpis.burn_rate} icon={TrendingDown} format="currency" color="red" />
              <KPICard title="Runway" value={latestKpis.runway_meses} icon={Clock} format="months" color="orange" />
            </KPISection>

            <KPISection title="Clientes">
              <KPICard title="ARPU" value={latestKpis.arpu} icon={DollarSign} format="currency" color="yellow" />
              <KPICard title="ARPU Anualizado" value={latestKpis.arpu_anualizado} icon={DollarSign} format="currency" color="orange" />
              <KPICard title="Churn Rate" value={latestKpis.churn_rate} icon={Users} format="percent" color="red" />
              <KPICard title="Retencion" value={latestKpis.retencion_clientes} icon={Users} format="percent" color="primary" />
              <KPICard title="LTV" value={latestKpis.ltv} icon={Target} format="currency" color="purple" />
            </KPISection>

            <KPISection title="Adquisicion">
              <KPICard title="CAC" value={latestKpis.cac} icon={DollarSign} format="currency" color="blue" />
              <KPICard title="LTV/CAC" value={latestKpis.ratio_ltv_cac} icon={Calculator} format="ratio" color="primary" description=">3 es bueno" />
              <KPICard title="Payback CAC" value={latestKpis.payback_cac_meses} icon={Clock} format="months" color="orange" />
              <KPICard title="Punto Equilibrio" value={latestKpis.punto_equilibrio_ratio} icon={Target} format="percent" color="yellow" />
            </KPISection>

            <KPISection title="Productividad">
              <KPICard title="Utilizacion Personal" value={latestKpis.utilizacion_personal} icon={Clock} format="percent" color="cyan" />
              <KPICard title="Ingreso por Hora" value={latestKpis.productividad_ingreso_por_hora} icon={DollarSign} format="currency" color="primary" />
              <KPICard title="Promedio 3M" value={latestKpis.promedio_ingresos_3m} icon={BarChart3} format="currency" color="blue" />
            </KPISection>

            <KPISection title="Crecimiento (vs Periodo Anterior)">
              <KPICard title="Crec. Ingresos" value={latestKpis.crecimiento_ingresos_pct} icon={TrendingUp} format="percent" color="primary" />
              <KPICard title="Crec. Utilidad" value={latestKpis.crecimiento_utilidad_pct} icon={TrendingUp} format="percent" color="blue" />
              <KPICard title="Var. Costos" value={latestKpis.variacion_costos_pct} icon={TrendingDown} format="percent" color="red" />
            </KPISection>

            {/* Charts */}
            <Tabs defaultValue="revenue" className="mb-6">
              <TabsList className="bg-secondary border-white/10">
                <TabsTrigger value="revenue" data-testid="tab-revenue">Ingresos</TabsTrigger>
                <TabsTrigger value="margin" data-testid="tab-margin">Margen</TabsTrigger>
                <TabsTrigger value="comparison" data-testid="tab-comparison">Comparativa</TabsTrigger>
                <TabsTrigger value="cashflow" data-testid="tab-cashflow">Cashflow</TabsTrigger>
              </TabsList>
              
              <TabsContent value="revenue" className="mt-4">
                <Card className="bg-[#121214] border-white/10 card-glow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Evolucion de Ingresos y Utilidad</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="period" stroke="#71717a" fontSize={11} />
                          <YAxis stroke="#71717a" fontSize={11} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                            labelStyle={{ color: '#fafafa' }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
                          <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="margin" className="mt-4">
                <Card className="bg-[#121214] border-white/10 card-glow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Evolucion del Margen Neto (%)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="period" stroke="#71717a" fontSize={11} />
                          <YAxis stroke="#71717a" fontSize={11} unit="%" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                            formatter={(value) => [`${value.toFixed(2)}%`, 'Margen']}
                          />
                          <Area type="monotone" dataKey="margen" name="Margen %" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="comparison" className="mt-4">
                <Card className="bg-[#121214] border-white/10 card-glow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Ingresos vs Costos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="period" stroke="#71717a" fontSize={11} />
                          <YAxis stroke="#71717a" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} />
                          <Legend />
                          <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="costos" name="Costos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="cashflow" className="mt-4">
                <Card className="bg-[#121214] border-white/10 card-glow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Flujo Operativo y Cashflow Acumulado</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="period" stroke="#71717a" fontSize={11} />
                          <YAxis stroke="#71717a" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} />
                          <Legend />
                          <Line type="monotone" dataKey="flujo" name="Flujo Operativo" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 3 }} />
                          <Line type="monotone" dataKey="cashflow_acum" name="Cashflow Acum." stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Data Table */}
            <Card className="bg-[#121214] border-white/10 card-glow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Datos por Periodo</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Periodo</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Ingresos</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Costos</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Utilidad</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Margen</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Crec.</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Acc.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {periods.map((row) => (
                        <TableRow key={row.period} className="border-white/5 hover:bg-white/5" data-testid={`data-row-${row.period}`}>
                          <TableCell className="font-mono text-xs">{row.period}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.ingresos_netos ? `S/ ${row.ingresos_netos.toLocaleString()}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.costos_directos ? `S/ ${row.costos_directos.toLocaleString()}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.utilidad_neta ? `S/ ${row.utilidad_neta.toLocaleString()}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.kpis?.margen_neto ? `${(row.kpis.margen_neto * 100).toFixed(1)}%` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.kpis?.crecimiento_ingresos_pct !== null && row.kpis?.crecimiento_ingresos_pct !== undefined ? (
                              <span className={row.kpis.crecimiento_ingresos_pct >= 0 ? 'text-green-500' : 'text-red-500'}>
                                {(row.kpis.crecimiento_ingresos_pct * 100).toFixed(1)}%
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeletePeriod(row.period)}
                              data-testid={`delete-period-${row.period}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
