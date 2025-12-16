// =====================================================
// KPI Metadata con reglas de semáforo estándar financiero
// =====================================================

export const KPI_META = {
  // Semáforo estándar financiero (NO configurable)
  margen_neto: { title: "Margen Neto", unit: "pct", rule: { type: "high_good", redMax: 0.05, yellowMax: 0.15 } },
  margen_bruto: { title: "Margen Bruto", unit: "pct", rule: { type: "high_good", redMax: 0.20, yellowMax: 0.35 } },
  margen_operativo: { title: "Margen Operativo", unit: "pct", rule: { type: "high_good", redMax: 0.08, yellowMax: 0.15 } },

  liquidez_corriente: { title: "Liquidez Corriente", unit: "ratio", rule: { type: "high_good", redMax: 1.0, yellowMax: 1.5 } },

  churn_rate: { title: "Churn Rate", unit: "pct", rule: { type: "low_good", greenMax: 0.05, yellowMax: 0.10 } },
  retencion: { title: "Retención", unit: "pct", rule: { type: "high_good", redMax: 0.80, yellowMax: 0.90 } },

  ltv_cac: { title: "LTV/CAC", unit: "ratio2", rule: { type: "high_good", redMax: 2.0, yellowMax: 3.0 } },
  payback_cac_meses: { title: "Payback CAC", unit: "months", rule: { type: "low_good", greenMax: 3.0, yellowMax: 6.0 } },

  runway_meses: { title: "Runway", unit: "months", rule: { type: "high_good", redMax: 3.0, yellowMax: 6.0 } },

  // Sin semáforo (se ve el histórico igual)
  arpu: { title: "ARPU", unit: "money" },
  arpu_anualizado: { title: "ARPU anualizado", unit: "money" },
  ltv: { title: "LTV", unit: "money" },
  cac: { title: "CAC", unit: "money" },
  burn_rate: { title: "Burn Rate", unit: "money" },
  flujo_operativo: { title: "Flujo Operativo", unit: "money" },
  arr_anualizado: { title: "ARR (anualizado)", unit: "money" },
  margen_contribucion: { title: "Margen Contribución", unit: "money" },
  punto_equilibrio_ratio: { title: "Punto Equilibrio", unit: "pct" },
  utilizacion_personal: { title: "Utilización Personal", unit: "pct" },
  productividad_ingreso_por_hora: { title: "Productividad (S/ por hora)", unit: "money" },
  ratio_costos_fijos: { title: "Ratio Costos Fijos", unit: "pct" },
  ventas_vs_compras: { title: "Ventas vs Compras", unit: "money" },
  resultado_igv: { title: "Resultado IGV", unit: "money" },
  
  // Comparativos
  crecimiento_ingresos_pct: { title: "Crecimiento Ingresos", unit: "pct" },
  crecimiento_utilidad_pct: { title: "Crecimiento Utilidad", unit: "pct" },
  variacion_costos_pct: { title: "Variación Costos", unit: "pct" },
  delta_ingresos: { title: "Delta Ingresos", unit: "money" },
  delta_utilidad: { title: "Delta Utilidad", unit: "money" },
  
  // Rolling
  cashflow_acumulado: { title: "Cashflow Acumulado", unit: "money" },
  promedio_ingresos_3m: { title: "Promedio Ingresos 3M", unit: "money" },
};

export function formatValue(value, unit) {
  if (value == null) return "N/A";
  if (unit === "pct") return `${(Number(value) * 100).toFixed(2)}%`;
  if (unit === "ratio") return Number(value).toFixed(4);
  if (unit === "ratio2") return Number(value).toFixed(2);
  if (unit === "months") return `${Number(value).toFixed(1)} meses`;
  if (unit === "money") return `S/ ${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return String(value);
}

export function trafficLight(value, meta) {
  if (value == null || !meta?.rule) return { label: "Sin semáforo", dot: "bg-zinc-500", color: "zinc" };
  const r = meta.rule;

  // high_good: mayor es mejor
  if (r.type === "high_good") {
    if (value < r.redMax) return { label: "Crítico", dot: "bg-red-500", color: "red" };
    if (value < r.yellowMax) return { label: "Atención", dot: "bg-amber-500", color: "amber" };
    return { label: "Saludable", dot: "bg-emerald-500", color: "emerald" };
  }

  // low_good: menor es mejor
  if (r.type === "low_good") {
    if (value <= r.greenMax) return { label: "Saludable", dot: "bg-emerald-500", color: "emerald" };
    if (value <= r.yellowMax) return { label: "Atención", dot: "bg-amber-500", color: "amber" };
    return { label: "Crítico", dot: "bg-red-500", color: "red" };
  }

  return { label: "OK", dot: "bg-emerald-500", color: "emerald" };
}

// Grouped KPIs for display sections
export const KPI_GROUPS = {
  rentabilidad: {
    title: "Rentabilidad",
    keys: ["margen_neto", "margen_bruto", "margen_operativo", "margen_contribucion", "arr_anualizado"]
  },
  liquidez: {
    title: "Liquidez y Flujo",
    keys: ["liquidez_corriente", "flujo_operativo", "cashflow_acumulado", "burn_rate", "runway_meses"]
  },
  clientes: {
    title: "Clientes",
    keys: ["arpu", "arpu_anualizado", "churn_rate", "retencion", "ltv"]
  },
  adquisicion: {
    title: "Adquisición",
    keys: ["cac", "ltv_cac", "payback_cac_meses", "punto_equilibrio_ratio"]
  },
  productividad: {
    title: "Productividad",
    keys: ["utilizacion_personal", "productividad_ingreso_por_hora", "promedio_ingresos_3m"]
  },
  crecimiento: {
    title: "Crecimiento",
    keys: ["crecimiento_ingresos_pct", "crecimiento_utilidad_pct", "variacion_costos_pct"]
  }
};
