import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ScrollArea } from './ui/scroll-area';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend
} from 'recharts';
import { Plus, Receipt, CheckCircle2, DollarSign, FileText } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

export default function SalesPanel({ companyId }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    month: '',
    cliente: '',
    monto: '',
    estado: 'facturada',
    nota: ''
  });

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = async () => {
    try {
      const [salesRes, summaryRes] = await Promise.all([
        api.get(`/sales/${companyId}`),
        api.get(`/sales/${companyId}/summary`)
      ]);
      setItems(salesRes.data || []);
      setSummary(summaryRes.data || []);
    } catch (err) {
      console.error('Error loading sales:', err);
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    const fact = items.filter((x) => x.estado === 'facturada').reduce((a, x) => a + (x.monto || 0), 0);
    const conf = items.filter((x) => x.estado === 'confirmada').reduce((a, x) => a + (x.monto || 0), 0);
    return { fact, conf, total: fact + conf, n: items.length };
  }, [items]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/sales/${companyId}`, {
        ...formData,
        monto: parseFloat(formData.monto)
      });
      toast.success('Venta registrada');
      setDialogOpen(false);
      setFormData({ month: '', cliente: '', monto: '', estado: 'facturada', nota: '' });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar venta');
    }
  };

  if (loading) {
    return (
      <Card className="bg-[#121214] border-white/10 animate-pulse">
        <CardContent className="p-6 h-40" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">Seguimiento de Ventas</h2>
          <p className="text-sm text-muted-foreground">Solo ventas reales: facturadas o confirmadas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90" size="sm" data-testid="add-sale-btn">
              <Plus className="w-4 h-4 mr-1" />
              Nueva Venta
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#121214] border-white/10">
            <DialogHeader>
              <DialogTitle>Registrar Venta</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Mes (YYYY-MM)</Label>
                  <Input
                    name="month"
                    placeholder="2024-01"
                    value={formData.month}
                    onChange={handleInputChange}
                    className="bg-zinc-900/50 border-white/10"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Monto (S/)</Label>
                  <Input
                    name="monto"
                    type="number"
                    step="0.01"
                    placeholder="1000.00"
                    value={formData.monto}
                    onChange={handleInputChange}
                    className="bg-zinc-900/50 border-white/10"
                    required
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <Input
                  name="cliente"
                  placeholder="Nombre del cliente"
                  value={formData.cliente}
                  onChange={handleInputChange}
                  className="bg-zinc-900/50 border-white/10"
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Estado</Label>
                <Select 
                  value={formData.estado} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, estado: v }))}
                >
                  <SelectTrigger className="bg-zinc-900/50 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facturada">Facturada</SelectItem>
                    <SelectItem value="confirmada">Confirmada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Nota (opcional)</Label>
                <Input
                  name="nota"
                  placeholder="Observaciones..."
                  value={formData.nota}
                  onChange={handleInputChange}
                  className="bg-zinc-900/50 border-white/10"
                />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
                Registrar Venta
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-[#121214] border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Facturadas</span>
            </div>
            <p className="font-mono text-lg">S/ {totals.fact.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121214] border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Confirmadas</span>
            </div>
            <p className="font-mono text-lg">S/ {totals.conf.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121214] border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <p className="font-mono text-lg">S/ {totals.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121214] border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground"># Registros</span>
            </div>
            <p className="font-mono text-lg">{totals.n}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {summary.length > 0 && (
        <Card className="bg-[#121214] border-white/10 card-glow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ventas por Mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
                  <YAxis stroke="#71717a" fontSize={11} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                    formatter={(value) => [`S/ ${value.toLocaleString()}`, '']}
                  />
                  <Legend />
                  <Bar dataKey="facturada" name="Facturada" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="confirmada" name="Confirmada" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {items.length > 0 && (
        <Card className="bg-[#121214] border-white/10 card-glow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detalle de Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="text-xs">Mes</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs text-right">Monto</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs">Nota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((x, i) => (
                    <TableRow key={i} className="border-white/5 hover:bg-white/5">
                      <TableCell className="font-mono text-sm">{x.month}</TableCell>
                      <TableCell className="text-sm">{x.cliente}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        S/ {Number(x.monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          x.estado === 'confirmada' 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {x.estado === 'confirmada' ? <CheckCircle2 className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
                          {x.estado}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{x.nota || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && (
        <Card className="bg-[#121214] border-white/10">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Receipt className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No hay ventas registradas</p>
            <Button 
              variant="link" 
              className="text-primary mt-2"
              onClick={() => setDialogOpen(true)}
            >
              Registrar primera venta
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
