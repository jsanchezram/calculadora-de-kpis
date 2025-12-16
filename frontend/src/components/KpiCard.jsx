import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { KPI_META, formatValue, trafficLight } from '../lib/kpiMeta';
import { Card, CardContent } from './ui/card';
import { 
  Percent, DollarSign, Clock, Activity, Users, Target, 
  TrendingUp, Calculator, Wallet
} from 'lucide-react';

const iconMap = {
  margen_neto: Percent,
  margen_bruto: Percent,
  margen_operativo: Percent,
  margen_contribucion: DollarSign,
  ratio_costos_fijos: Percent,
  liquidez_corriente: Activity,
  flujo_operativo: TrendingUp,
  burn_rate: TrendingUp,
  runway_meses: Clock,
  arr_anualizado: DollarSign,
  punto_equilibrio_ratio: Target,
  arpu: DollarSign,
  arpu_anualizado: DollarSign,
  churn_rate: Users,
  retencion: Users,
  ltv: Target,
  cac: DollarSign,
  ltv_cac: Calculator,
  payback_cac_meses: Clock,
  utilizacion_personal: Clock,
  productividad_ingreso_por_hora: DollarSign,
  ventas_vs_compras: DollarSign,
  resultado_igv: DollarSign,
  crecimiento_ingresos_pct: TrendingUp,
  crecimiento_utilidad_pct: TrendingUp,
  variacion_costos_pct: TrendingUp,
  cashflow_acumulado: Wallet,
  promedio_ingresos_3m: DollarSign,
};

export default function KpiCard({ kpiKey, value, companyId: propCompanyId }) {
  const navigate = useNavigate();
  const params = useParams();
  const companyId = propCompanyId || params.id;
  
  const meta = KPI_META[kpiKey] || { title: kpiKey, unit: null };
  const sem = trafficLight(value, meta);
  const Icon = iconMap[kpiKey] || Activity;

  const handleClick = () => {
    if (companyId) {
      navigate(`/company/${companyId}/kpi/${kpiKey}`);
    }
  };

  return (
    <Card 
      className="bg-[#121214] border-white/10 card-glow hover:border-white/20 transition-all cursor-pointer group"
      onClick={handleClick}
      data-testid={`kpi-card-${kpiKey}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className={`w-8 h-8 rounded-lg bg-secondary flex items-center justify-center`}>
            <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className={`flex items-center gap-1.5 text-xs`}>
            <span className={`h-2 w-2 rounded-full ${sem.dot}`} />
            <span className="text-muted-foreground">{sem.label}</span>
          </div>
        </div>
        <p className="kpi-label text-[10px] mb-1">{meta.title}</p>
        <p className="kpi-value text-xl">{formatValue(value, meta.unit)}</p>
        <p className="text-[10px] text-muted-foreground mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          Click para ver historial →
        </p>
      </CardContent>
    </Card>
  );
}
