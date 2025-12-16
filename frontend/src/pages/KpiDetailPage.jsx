import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDashboard } from '../lib/api';
import { KPI_META, formatValue, trafficLight } from '../lib/kpiMeta';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, ReferenceLine, Area, AreaChart
} from 'recharts';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function KpiDetailPage() {
  const { id: companyId, kpiKey } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const meta = KPI_META[kpiKey] || { title: kpiKey, unit: null };

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = async () => {
    try {
      const res = await getDashboard(companyId);
      setRows(res.data || []);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const series = useMemo(() => {
    return (rows || [])
      .map((r) => ({ 
        period: r.period, 
        value: r?.kpis?.[kpiKey] ?? null,
        raw: r
      }))
      .filter((x) => x.period);
  }, [rows, kpiKey]);

  const latest = series.length ? series[series.length - 1].value : null;
  const previous = series.length > 1 ? series[series.length - 2].value : null;
  const sem = trafficLight(latest, meta);

  // Calculate trend
  const trend = useMemo(() => {
    if (latest === null || previous === null) return 'neutral';
    if (latest > previous) return 'up';
    if (latest < previous) return 'down';
    return 'neutral';
  }, [latest, previous]);

  // Calculate stats
  const stats = useMemo(() => {
    const values = series.map(s => s.value).filter(v => v !== null);
    if (values.length === 0) return null;
    
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length
    };
  }, [series]);

  // Reference lines for semaphore
  const referenceLines = useMemo(() => {
    if (!meta.rule) return [];
    const lines = [];
    
    if (meta.rule.type === 'high_good') {
      lines.push({ y: meta.rule.redMax, color: '#ef4444', label: 'Crítico' });
      lines.push({ y: meta.rule.yellowMax, color: '#f59e0b', label: 'Atención' });
    } else if (meta.rule.type === 'low_good') {
      lines.push({ y: meta.rule.greenMax, color: '#10b981', label: 'Saludable' });
      lines.push({ y: meta.rule.yellowMax, color: '#f59e0b', label: 'Atención' });
    }
    
    return lines;
  }, [meta]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="glass sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate(`/company/${companyId}`)}
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Detalle de indicador</p>
              <h1 className="text-xl font-bold tracking-tight">{meta.title}</h1>
            </div>
            <div className="text-right">
              <p className="kpi-value text-2xl">{formatValue(latest, meta.unit)}</p>
              <div className="flex items-center justify-end gap-2 mt-1">
                <span className={`h-2 w-2 rounded-full ${sem.dot}`} />
                <span className="text-xs text-muted-foreground">{sem.label}</span>
                {trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
                {trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
                {trend === 'neutral' && <Minus className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-[#121214] border-white/10">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Mínimo</p>
                <p className="font-mono text-lg">{formatValue(stats.min, meta.unit)}</p>
              </CardContent>
            </Card>
            <Card className="bg-[#121214] border-white/10">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Máximo</p>
                <p className="font-mono text-lg">{formatValue(stats.max, meta.unit)}</p>
              </CardContent>
            </Card>
            <Card className="bg-[#121214] border-white/10">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Promedio</p>
                <p className="font-mono text-lg">{formatValue(stats.avg, meta.unit)}</p>
              </CardContent>
            </Card>
            <Card className="bg-[#121214] border-white/10">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Periodos</p>
                <p className="font-mono text-lg">{stats.count}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Chart */}
        <Card className="bg-[#121214] border-white/10 card-glow mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Histórico por periodos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="period" stroke="#71717a" fontSize={11} />
                  <YAxis stroke="#71717a" fontSize={11} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                    formatter={(value) => [formatValue(value, meta.unit), meta.title]}
                  />
                  {referenceLines.map((line, i) => (
                    <ReferenceLine 
                      key={i} 
                      y={line.y} 
                      stroke={line.color} 
                      strokeDasharray="5 5"
                      label={{ value: line.label, fill: line.color, fontSize: 10 }}
                    />
                  ))}
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#10b981" 
                    fillOpacity={1}
                    fill="url(#colorValue)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-[#121214] border-white/10 card-glow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tabla histórica</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Periodo</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Valor</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Semáforo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...series].reverse().map((s) => {
                    const st = trafficLight(s.value, meta);
                    return (
                      <TableRow key={s.period} className="border-white/5 hover:bg-white/5">
                        <TableCell className="font-mono text-sm">{s.period}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatValue(s.value, meta.unit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center gap-2 text-sm">
                            <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                            <span className="text-muted-foreground">{st.label}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Semaphore Legend */}
        {meta.rule && (
          <Card className="bg-[#121214] border-white/10 mt-6">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-3">Reglas del semáforo</p>
              <div className="flex flex-wrap gap-4 text-sm">
                {meta.rule.type === 'high_good' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-red-500" />
                      <span>Crítico: &lt; {formatValue(meta.rule.redMax, meta.unit)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-amber-500" />
                      <span>Atención: {formatValue(meta.rule.redMax, meta.unit)} - {formatValue(meta.rule.yellowMax, meta.unit)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-emerald-500" />
                      <span>Saludable: &gt; {formatValue(meta.rule.yellowMax, meta.unit)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-emerald-500" />
                      <span>Saludable: ≤ {formatValue(meta.rule.greenMax, meta.unit)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-amber-500" />
                      <span>Atención: {formatValue(meta.rule.greenMax, meta.unit)} - {formatValue(meta.rule.yellowMax, meta.unit)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-red-500" />
                      <span>Crítico: &gt; {formatValue(meta.rule.yellowMax, meta.unit)}</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
