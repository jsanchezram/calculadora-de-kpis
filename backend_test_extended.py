#!/usr/bin/env python3
"""
Extended Backend Test for SaaS Financiero - KPIs Completos
Testing new features: extended KPIs, new fields, dashboard summary endpoint
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class ExtendedAPITester:
    def __init__(self, base_url="https://bizmetrics-22.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.company_id = None
        
    def log(self, message: str):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, params: Optional[Dict] = None) -> tuple:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    self.log(f"   Error: {error_detail}")
                except:
                    self.log(f"   Response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            self.log(f"❌ {name} - Exception: {str(e)}")
            return False, {}

    def setup_auth(self) -> bool:
        """Setup authentication and company"""
        # Register test user
        test_email = f"test_extended_{datetime.now().strftime('%H%M%S')}@test.com"
        test_password = "TestPass123!"
        
        success, _ = self.run_test(
            "User Registration",
            "POST", 
            "register",
            200,
            {"email": test_email, "password": test_password}
        )
        
        if not success:
            return False
            
        # Login
        success, response = self.run_test(
            "User Login",
            "POST",
            "login", 
            200,
            {"email": test_email, "password": test_password}
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.log(f"🔑 Token obtained: {self.token[:20]}...")
        else:
            return False
            
        # Create company
        success, response = self.run_test(
            "Create Company",
            "POST",
            "companies",
            200,
            {"name": "Test Company Extended KPIs"}
        )
        
        if success and 'id' in response:
            self.company_id = response['id']
            self.log(f"🏢 Company created: {self.company_id}")
            return True
        
        return False

    def test_kpis_metadata(self) -> bool:
        """Test GET /api/kpis/metadata endpoint"""
        success, response = self.run_test(
            "KPIs Metadata",
            "GET",
            "kpis/metadata",
            200
        )
        
        if success:
            kpis = response.get('kpis', [])
            expected_kpis = [
                'margen_neto', 'margen_bruto', 'margen_operativo', 'margen_contribucion',
                'ratio_costos_fijos', 'liquidez_corriente', 'flujo_operativo', 
                'punto_equilibrio_ratio', 'utilizacion_personal', 'productividad_ingreso_por_hora',
                'arpu', 'arpu_anualizado', 'churn_rate', 'retencion_clientes', 'ltv', 'cac',
                'ratio_ltv_cac', 'payback_cac_meses', 'ventas_vs_compras', 'resultado_igv',
                'burn_rate', 'runway_meses', 'ingresos_anualizados', 'crecimiento_ingresos_pct',
                'crecimiento_utilidad_pct', 'variacion_costos_pct', 'cashflow_acumulado',
                'promedio_ingresos_3m'
            ]
            
            found_kpis = [kpi['key'] for kpi in kpis]
            missing_kpis = [k for k in expected_kpis if k not in found_kpis]
            
            if missing_kpis:
                self.log(f"⚠️  Missing KPIs in metadata: {missing_kpis}")
                return False
            else:
                self.log(f"✅ All {len(expected_kpis)} KPIs found in metadata")
                return True
        
        return False

    def test_new_fields_data_endpoint(self) -> bool:
        """Test POST /api/data/{company_id} with new fields"""
        test_data = {
            "period": "2024-01",
            "ingresos_netos": 50000.0,
            "costos_directos": 20000.0,
            "costos_fijos": 15000.0,
            "gastos_operativos": 8000.0,
            "utilidad_neta": 7000.0,
            "utilidad_operativa": 10000.0,  # New field
            "activo_corriente": 25000.0,
            "pasivo_corriente": 10000.0,
            "clientes_activos": 100,
            "clientes_nuevos": 15,
            "clientes_perdidos": 5,
            "horas_disponibles": 160.0,
            "horas_facturadas": 140.0,
            "gasto_comercial": 3000.0,
            "caja": 30000.0,  # New field
            "egresos_totales": 43000.0,  # New field
        }
        
        success, response = self.run_test(
            "Add Data with New Fields",
            "POST",
            f"data/{self.company_id}",
            200,
            test_data
        )
        
        if success:
            # Verify new fields are stored
            if 'caja' in response and 'egresos_totales' in response and 'utilidad_operativa' in response:
                self.log("✅ New fields (caja, egresos_totales, utilidad_operativa) accepted")
                
                # Verify KPIs are calculated
                kpis = response.get('kpis', {})
                expected_kpi_keys = ['burn_rate', 'runway_meses', 'margen_operativo']
                
                found_kpis = [k for k in expected_kpi_keys if k in kpis and kpis[k] is not None]
                if len(found_kpis) >= 2:
                    self.log(f"✅ KPIs calculated with new fields: {found_kpis}")
                    return True
                else:
                    self.log(f"⚠️  Expected KPIs not calculated: {expected_kpi_keys}")
            else:
                self.log("❌ New fields not found in response")
        
        return False

    def test_dashboard_summary_endpoint(self) -> bool:
        """Test GET /api/dashboard/{company_id}/summary endpoint"""
        # Add more test data for better summary
        periods_data = [
            {
                "period": "2024-02",
                "ingresos_netos": 55000.0,
                "costos_directos": 22000.0,
                "utilidad_neta": 8000.0,
                "caja": 35000.0,
                "egresos_totales": 47000.0,
            },
            {
                "period": "2024-03", 
                "ingresos_netos": 60000.0,
                "costos_directos": 24000.0,
                "utilidad_neta": 9000.0,
                "caja": 40000.0,
                "egresos_totales": 51000.0,
            }
        ]
        
        # Add additional periods
        for period_data in periods_data:
            self.run_test(
                f"Add Data {period_data['period']}",
                "POST",
                f"data/{self.company_id}",
                200,
                period_data
            )
        
        # Test summary endpoint without filters
        success, response = self.run_test(
            "Dashboard Summary (no filters)",
            "GET",
            f"dashboard/{self.company_id}/summary",
            200
        )
        
        if success:
            # Verify response structure
            required_keys = ['periods', 'summary']
            if all(key in response for key in required_keys):
                periods = response['periods']
                summary = response['summary']
                
                self.log(f"✅ Summary structure valid - {len(periods)} periods found")
                
                # Verify periods have complete KPIs
                if periods:
                    latest_period = periods[-1]
                    kpis = latest_period.get('kpis', {})
                    
                    # Check for comparative KPIs
                    comparative_kpis = ['crecimiento_ingresos_pct', 'crecimiento_utilidad_pct']
                    rolling_kpis = ['cashflow_acumulado', 'promedio_ingresos_3m']
                    
                    found_comparative = [k for k in comparative_kpis if k in kpis]
                    found_rolling = [k for k in rolling_kpis if k in kpis]
                    
                    self.log(f"✅ Comparative KPIs: {found_comparative}")
                    self.log(f"✅ Rolling KPIs: {found_rolling}")
                    
                    return len(found_comparative) >= 1 and len(found_rolling) >= 1
                else:
                    self.log("❌ No periods in summary response")
            else:
                self.log(f"❌ Missing required keys in summary: {required_keys}")
        
        return False

    def test_dashboard_summary_with_filters(self) -> bool:
        """Test GET /api/dashboard/{company_id}/summary with date filters"""
        success, response = self.run_test(
            "Dashboard Summary with Filters",
            "GET",
            f"dashboard/{self.company_id}/summary",
            200,
            params={"from": "2024-02", "to": "2024-03"}
        )
        
        if success:
            periods = response.get('periods', [])
            summary = response.get('summary', {})
            date_range = summary.get('date_range', {})
            
            # Verify filtering worked
            if date_range.get('from') == '2024-02' and date_range.get('to') == '2024-03':
                self.log(f"✅ Date filtering works - {len(periods)} periods in range")
                return True
            else:
                self.log(f"❌ Date filtering failed - range: {date_range}")
        
        return False

    def test_comparative_kpis_calculation(self) -> bool:
        """Verify comparative KPIs are calculated correctly"""
        success, response = self.run_test(
            "Get Dashboard for KPI Verification",
            "GET",
            f"dashboard/{self.company_id}/summary",
            200
        )
        
        if success:
            periods = response.get('periods', [])
            if len(periods) >= 2:
                # Check last period has comparative KPIs
                latest = periods[-1]
                kpis = latest.get('kpis', {})
                
                # Verify growth calculations
                growth_income = kpis.get('crecimiento_ingresos_pct')
                growth_profit = kpis.get('crecimiento_utilidad_pct')
                
                if growth_income is not None and growth_profit is not None:
                    self.log(f"✅ Comparative KPIs calculated - Income growth: {growth_income:.2%}, Profit growth: {growth_profit:.2%}")
                    return True
                else:
                    self.log("❌ Comparative KPIs not calculated")
            else:
                self.log("⚠️  Need at least 2 periods for comparative KPIs")
        
        return False

    def test_rolling_kpis_calculation(self) -> bool:
        """Verify rolling KPIs (cashflow_acumulado, promedio_ingresos_3m)"""
        success, response = self.run_test(
            "Get Dashboard for Rolling KPIs",
            "GET", 
            f"dashboard/{self.company_id}/summary",
            200
        )
        
        if success:
            periods = response.get('periods', [])
            if periods:
                latest = periods[-1]
                kpis = latest.get('kpis', {})
                
                cashflow_acum = kpis.get('cashflow_acumulado')
                avg_3m = kpis.get('promedio_ingresos_3m')
                
                if cashflow_acum is not None and avg_3m is not None:
                    self.log(f"✅ Rolling KPIs calculated - Cashflow acum: {cashflow_acum}, Avg 3M: {avg_3m}")
                    return True
                else:
                    self.log("❌ Rolling KPIs not calculated")
        
        return False

    def test_burn_rate_runway_calculation(self) -> bool:
        """Verify burn_rate and runway_meses with new fields"""
        success, response = self.run_test(
            "Get Dashboard for Burn Rate/Runway",
            "GET",
            f"dashboard/{self.company_id}/summary", 
            200
        )
        
        if success:
            periods = response.get('periods', [])
            if periods:
                latest = periods[-1]
                kpis = latest.get('kpis', {})
                
                burn_rate = kpis.get('burn_rate')
                runway = kpis.get('runway_meses')
                
                # Verify burn_rate equals egresos_totales
                egresos = latest.get('egresos_totales')
                
                if burn_rate == egresos and runway is not None:
                    self.log(f"✅ Burn rate/runway calculated - Burn: {burn_rate}, Runway: {runway} months")
                    return True
                else:
                    self.log(f"❌ Burn rate/runway calculation issue - Burn: {burn_rate}, Egresos: {egresos}, Runway: {runway}")
        
        return False

    def test_upload_with_nan_strings(self) -> bool:
        """Test POST /api/upload/{company_id} with NaN and string numbers"""
        # This would require creating an actual Excel file, so we'll simulate by testing
        # the data endpoint with string numbers and None values
        test_data_with_strings = {
            "period": "2024-04",
            "ingresos_netos": "65000.50",  # String number
            "costos_directos": 25000.0,
            "utilidad_neta": None,  # None value
            "caja": "45000",  # String integer
        }
        
        success, response = self.run_test(
            "Add Data with String Numbers",
            "POST",
            f"data/{self.company_id}",
            200,
            test_data_with_strings
        )
        
        if success:
            # Verify string numbers were converted
            ingresos = response.get('ingresos_netos')
            caja = response.get('caja')
            
            if isinstance(ingresos, (int, float)) and isinstance(caja, (int, float)):
                self.log(f"✅ String numbers converted - Ingresos: {ingresos}, Caja: {caja}")
                return True
            else:
                self.log(f"❌ String conversion failed - Ingresos: {type(ingresos)}, Caja: {type(caja)}")
        
        return False

    def run_all_tests(self) -> bool:
        """Run all extended tests"""
        self.log("🚀 Starting Extended SaaS Financiero API Tests")
        
        # Setup
        if not self.setup_auth():
            self.log("❌ Setup failed - cannot continue")
            return False
        
        # Test new features
        tests = [
            ("KPIs Metadata", self.test_kpis_metadata),
            ("New Fields Data Endpoint", self.test_new_fields_data_endpoint), 
            ("Dashboard Summary Endpoint", self.test_dashboard_summary_endpoint),
            ("Dashboard Summary with Filters", self.test_dashboard_summary_with_filters),
            ("Comparative KPIs Calculation", self.test_comparative_kpis_calculation),
            ("Rolling KPIs Calculation", self.test_rolling_kpis_calculation),
            ("Burn Rate/Runway Calculation", self.test_burn_rate_runway_calculation),
            ("Upload with NaN/Strings", self.test_upload_with_nan_strings),
        ]
        
        for test_name, test_func in tests:
            try:
                if not test_func():
                    self.log(f"❌ {test_name} failed")
            except Exception as e:
                self.log(f"❌ {test_name} exception: {str(e)}")
        
        # Print results
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        self.log(f"\n📊 Extended Tests Results: {self.tests_passed}/{self.tests_run} passed ({success_rate:.1f}%)")
        
        return success_rate >= 80

def main():
    tester = ExtendedAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())