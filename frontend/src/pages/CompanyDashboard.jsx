import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCompany, getDashboardSummary, addData, deleteData, uploadExcel } from '../lib/api';
import { KPI_GROUPS } from '../lib/kpiMeta';
import KpiCard from '../components/KpiCard';
import SalesPanel from '../components/SalesPanel';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  ArrowLeft, Plus, Upload, Download, TrendingUp, TrendingDown, 
  FileSpreadsheet, Trash2, LogOut, Minus
} from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, Area, AreaChart
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// KPI Section Component
const KPISection = ({ title, kpis, latestKpis, companyId }) => {
  const hasData = kpis.some(key => latestKpis[key] !== null && latestKpis[key] !== undefined);
  
  if (!hasData) return null;
  
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(key => (
          <KpiCard 
            key={key} 
            kpiKey={key} 
            value={latestKpis[key]} 
            companyId={companyId}
          />
        ))}
      </div>
    </div>
  );
};

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
  const [activeTab, setActiveTab] = useState('kpis');
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
    gasto_comercial: '',
    caja_efectivo: '',
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
        horas_disponibles: '', horas_facturadas: '', gasto_comercial: '', caja_efectivo: '', 
        egresos_totales: '',
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
                <p className="text-xs text-muted-foreground">Dashboard Financiero</p>
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
                  <p id="upload-excel-description" className="text-sm text-muted-foreground mt-2">
                    Columnas: period (requerido), ingresos_netos, costos_directos, costos_fijos, 
                    gastos_operativos, utilidad_neta, clientes_activos, caja_efectivo, egresos_totales, etc.
                  </p>
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="mt-4 bg-zinc-900/50 border-white/10"
                    data-testid="excel-file-input"
                  />
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
                      Registra los datos financieros de un periodo (YYYY-MM)
                    </p>
                  </DialogHeader>
                  <form onSubmit={handleSubmitData} className="mt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-3">
                        <Label className="text-xs">Periodo * (YYYY-MM)</Label>
                        <Input name="period" placeholder="2024-01" value={formData.period} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" data-testid="period-input" required />
                      </div>
                      
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
                      <div>
                        <Label className="text-xs">Activo Corriente</Label>
                        <Input name="activo_corriente" type="number" step="0.01" value={formData.activo_corriente} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label className="text-xs">Pasivo Corriente</Label>
                        <Input name="pasivo_corriente" type="number" step="0.01" value={formData.pasivo_corriente} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
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
                      <div>
                        <Label className="text-xs">Caja (Efectivo)</Label>
                        <Input name="caja_efectivo" type="number" step="0.01" value={formData.caja_efectivo} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
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

            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList className="bg-secondary border-white/10">
                <TabsTrigger value="kpis">KPIs</TabsTrigger>
                <TabsTrigger value="charts">Gráficos</TabsTrigger>
                <TabsTrigger value="data">Datos</TabsTrigger>
                <TabsTrigger value="sales">Ventas</TabsTrigger>
              </TabsList>

              <TabsContent value="kpis" className="mt-4">
                {/* KPI Sections using KpiCard */}
                {Object.entries(KPI_GROUPS).map(([groupKey, group]) => (
                  <KPISection 
                    key={groupKey}
                    title={group.title}
                    kpis={group.keys}
                    latestKpis={latestKpis}
                    companyId={id}
                  />
                ))}
              </TabsContent>

              <TabsContent value="charts" className="mt-4">
                <Tabs defaultValue="revenue">
                  <TabsList className="bg-secondary/50 border-white/10">
                    <TabsTrigger value="revenue">Ingresos</TabsTrigger>
                    <TabsTrigger value="margin">Margen</TabsTrigger>
                    <TabsTrigger value="comparison">Comparativa</TabsTrigger>
                    <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="revenue" className="mt-4">
                    <Card className="bg-[#121214] border-white/10 card-glow">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Evolución de Ingresos y Utilidad</CardTitle>
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
                        <CardTitle className="text-base">Evolución del Margen Neto (%)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <XAxis dataKey="period" stroke="#71717a" fontSize={11} />
                              <YAxis stroke="#71717a" fontSize={11} unit="%" />
                              <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} formatter={(value) => [`${value.toFixed(2)}%`, 'Margen']} />
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
              </TabsContent>

              <TabsContent value="data" className="mt-4">
                <Card className="bg-[#121214] border-white/10 card-glow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Datos por Periodo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10">
                            <TableHead className="text-[10px] uppercase">Periodo</TableHead>
                            <TableHead className="text-[10px] uppercase text-right">Ingresos</TableHead>
                            <TableHead className="text-[10px] uppercase text-right">Costos</TableHead>
                            <TableHead className="text-[10px] uppercase text-right">Utilidad</TableHead>
                            <TableHead className="text-[10px] uppercase text-right">Margen</TableHead>
                            <TableHead className="text-[10px] uppercase text-right">Crec.</TableHead>
                            <TableHead className="text-[10px] uppercase text-right"></TableHead>
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
              </TabsContent>

              <TabsContent value="sales" className="mt-4">
                <SalesPanel companyId={id} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
