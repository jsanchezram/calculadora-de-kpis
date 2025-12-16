import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCompany, getDashboard, getSummary, addData, deleteData, uploadExcel } from '../lib/api';
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
  DollarSign, Users, Clock, Target, Percent, Activity,
  FileSpreadsheet, Trash2, LogOut
} from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const KPICard = ({ title, value, icon: Icon, trend, format = 'number', color = 'primary' }) => {
  const formatValue = (val) => {
    if (val === null || val === undefined) return 'N/A';
    if (format === 'percent') return `${(val * 100).toFixed(2)}%`;
    if (format === 'currency') return `S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
    if (format === 'decimal') return val.toFixed(4);
    return val.toLocaleString('es-PE');
  };

  const colorClasses = {
    primary: 'text-primary',
    blue: 'text-blue-500',
    yellow: 'text-yellow-500',
    red: 'text-red-500',
    purple: 'text-purple-500',
  };

  return (
    <Card className="bg-[#121214] border-white/10 card-glow h-full">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-9 h-9 rounded-lg bg-secondary flex items-center justify-center ${colorClasses[color]}`}>
            <Icon className="w-4 h-4" />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-xs ${trend === 'up' ? 'text-primary' : 'text-red-500'}`}>
              {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            </div>
          )}
        </div>
        <p className="kpi-label mb-1">{title}</p>
        <p className="kpi-value">{formatValue(value)}</p>
      </CardContent>
    </Card>
  );
};

export default function CompanyDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const dashboardRef = useRef(null);
  
  const [company, setCompany] = useState(null);
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    period: '',
    ingresos_netos: '',
    costos_directos: '',
    costos_fijos: '',
    gastos_operativos: '',
    utilidad_neta: '',
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
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [companyRes, dashboardRes, summaryRes] = await Promise.all([
        getCompany(id),
        getDashboard(id),
        getSummary(id),
      ]);
      setCompany(companyRes.data);
      setData(dashboardRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      toast.error('Error al cargar datos');
      navigate('/dashboard');
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
        gastos_operativos: '', utilidad_neta: '', activo_corriente: '', pasivo_corriente: '',
        clientes_activos: '', clientes_nuevos: '', clientes_perdidos: '', horas_disponibles: '',
        horas_facturadas: '', ventas_netas: '', compras_netas: '', igv_ventas: '',
        igv_compras: '', gasto_comercial: '',
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
      await uploadExcel(id, file);
      toast.success('Archivo procesado exitosamente');
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

  const latestKpis = summary?.latest_kpis || {};
  const chartData = data.map((d) => ({
    period: d.period,
    ingresos: d.ingresos_netos || 0,
    costos: d.costos_directos || 0,
    utilidad: d.utilidad_neta || 0,
    margen: d.kpis?.margen_neto ? d.kpis.margen_neto * 100 : 0,
  }));

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="glass sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                <h1 className="text-xl font-bold tracking-tight">{company?.name}</h1>
                <p className="text-sm text-muted-foreground">Dashboard Financiero</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportToPDF}
                className="border-white/10"
                data-testid="export-pdf-btn"
              >
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="border-white/10" data-testid="upload-excel-btn">
                    <Upload className="w-4 h-4 mr-2" />
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
                      El archivo debe tener una columna "period" y las columnas de datos financieros.
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
                  <Button className="bg-primary hover:bg-primary/90 glow-green" data-testid="add-data-btn">
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Datos
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#121214] border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="add-data-description">
                  <DialogHeader>
                    <DialogTitle>Agregar Datos Financieros</DialogTitle>
                    <p id="add-data-description" className="text-sm text-muted-foreground">
                      Registra los datos financieros de un periodo
                    </p>
                  </DialogHeader>
                  <form onSubmit={handleSubmitData} className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Periodo *</Label>
                        <Input
                          name="period"
                          placeholder="2024-01"
                          value={formData.period}
                          onChange={handleInputChange}
                          className="bg-zinc-900/50 border-white/10"
                          data-testid="period-input"
                          required
                        />
                      </div>
                      <div>
                        <Label>Ingresos Netos</Label>
                        <Input name="ingresos_netos" type="number" step="0.01" value={formData.ingresos_netos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" data-testid="ingresos-input" />
                      </div>
                      <div>
                        <Label>Costos Directos</Label>
                        <Input name="costos_directos" type="number" step="0.01" value={formData.costos_directos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Costos Fijos</Label>
                        <Input name="costos_fijos" type="number" step="0.01" value={formData.costos_fijos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Gastos Operativos</Label>
                        <Input name="gastos_operativos" type="number" step="0.01" value={formData.gastos_operativos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Utilidad Neta</Label>
                        <Input name="utilidad_neta" type="number" step="0.01" value={formData.utilidad_neta} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Activo Corriente</Label>
                        <Input name="activo_corriente" type="number" step="0.01" value={formData.activo_corriente} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Pasivo Corriente</Label>
                        <Input name="pasivo_corriente" type="number" step="0.01" value={formData.pasivo_corriente} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Clientes Activos</Label>
                        <Input name="clientes_activos" type="number" value={formData.clientes_activos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Clientes Nuevos</Label>
                        <Input name="clientes_nuevos" type="number" value={formData.clientes_nuevos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Clientes Perdidos</Label>
                        <Input name="clientes_perdidos" type="number" value={formData.clientes_perdidos} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Horas Disponibles</Label>
                        <Input name="horas_disponibles" type="number" step="0.01" value={formData.horas_disponibles} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Horas Facturadas</Label>
                        <Input name="horas_facturadas" type="number" step="0.01" value={formData.horas_facturadas} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
                      </div>
                      <div>
                        <Label>Gasto Comercial</Label>
                        <Input name="gasto_comercial" type="number" step="0.01" value={formData.gasto_comercial} onChange={handleInputChange} className="bg-zinc-900/50 border-white/10" />
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
                data-testid="logout-btn"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" ref={dashboardRef}>
        {data.length === 0 ? (
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
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KPICard title="Margen Neto" value={latestKpis.margen_neto} icon={Percent} format="percent" color="primary" />
              <KPICard title="Liquidez Corriente" value={latestKpis.liquidez_corriente} icon={Activity} format="decimal" color="blue" />
              <KPICard title="Churn Rate" value={latestKpis.churn_rate} icon={Users} format="percent" color="red" />
              <KPICard title="ARPU" value={latestKpis.arpu} icon={DollarSign} format="currency" color="yellow" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KPICard title="LTV" value={latestKpis.ltv} icon={Target} format="currency" color="purple" />
              <KPICard title="CAC" value={latestKpis.cac} icon={DollarSign} format="currency" color="blue" />
              <KPICard title="Utilizacion Personal" value={latestKpis.utilizacion_personal} icon={Clock} format="percent" color="yellow" />
              <KPICard title="Flujo Operativo" value={latestKpis.flujo_operativo} icon={TrendingUp} format="currency" color="primary" />
            </div>

            {/* Charts */}
            <Tabs defaultValue="revenue" className="mb-6">
              <TabsList className="bg-secondary border-white/10">
                <TabsTrigger value="revenue" data-testid="tab-revenue">Ingresos</TabsTrigger>
                <TabsTrigger value="margin" data-testid="tab-margin">Margen</TabsTrigger>
                <TabsTrigger value="comparison" data-testid="tab-comparison">Comparativa</TabsTrigger>
              </TabsList>
              
              <TabsContent value="revenue" className="mt-4">
                <Card className="bg-[#121214] border-white/10 card-glow">
                  <CardHeader>
                    <CardTitle className="text-lg">Evolucion de Ingresos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="period" stroke="#71717a" fontSize={12} />
                          <YAxis stroke="#71717a" fontSize={12} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                            labelStyle={{ color: '#fafafa' }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
                          <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="margin" className="mt-4">
                <Card className="bg-[#121214] border-white/10 card-glow">
                  <CardHeader>
                    <CardTitle className="text-lg">Evolucion del Margen Neto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="period" stroke="#71717a" fontSize={12} />
                          <YAxis stroke="#71717a" fontSize={12} unit="%" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                            formatter={(value) => [`${value.toFixed(2)}%`, 'Margen']}
                          />
                          <Line type="monotone" dataKey="margen" name="Margen %" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="comparison" className="mt-4">
                <Card className="bg-[#121214] border-white/10 card-glow">
                  <CardHeader>
                    <CardTitle className="text-lg">Ingresos vs Costos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="period" stroke="#71717a" fontSize={12} />
                          <YAxis stroke="#71717a" fontSize={12} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                          />
                          <Legend />
                          <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="costos" name="Costos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Data Table */}
            <Card className="bg-[#121214] border-white/10 card-glow">
              <CardHeader>
                <CardTitle className="text-lg">Datos por Periodo</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Periodo</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Ingresos</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Costos</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Utilidad</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Margen</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((row) => (
                        <TableRow key={row.period} className="border-white/5 hover:bg-white/5" data-testid={`data-row-${row.period}`}>
                          <TableCell className="font-mono">{row.period}</TableCell>
                          <TableCell className="text-right font-mono">
                            {row.ingresos_netos ? `S/ ${row.ingresos_netos.toLocaleString()}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.costos_directos ? `S/ ${row.costos_directos.toLocaleString()}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.utilidad_neta ? `S/ ${row.utilidad_neta.toLocaleString()}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.kpis?.margen_neto ? `${(row.kpis.margen_neto * 100).toFixed(2)}%` : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeletePeriod(row.period)}
                              data-testid={`delete-period-${row.period}`}
                            >
                              <Trash2 className="w-4 h-4" />
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
