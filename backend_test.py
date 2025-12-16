import requests
import sys
import json
from datetime import datetime

class SaaSFinancieroTester:
    def __init__(self, base_url="https://bizmetrics-22.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.company_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {method} {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    # Remove Content-Type for file uploads
                    headers.pop('Content-Type', None)
                    response = requests.post(url, files=files, headers=headers)
                else:
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.log_test(name, True)
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg += f" - {error_detail}"
                except:
                    error_msg += f" - {response.text}"
                self.log_test(name, False, error_msg)
                return False, {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health",
            200
        )
        return success

    def test_register(self):
        """Test user registration"""
        test_email = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}@test.com"
        test_password = "TestPass123!"
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "register",
            200,
            data={"email": test_email, "password": test_password}
        )
        
        if success:
            self.test_email = test_email
            self.test_password = test_password
        
        return success

    def test_register_validation(self):
        """Test registration validation"""
        # Test short password
        success, _ = self.run_test(
            "Registration - Short Password Validation",
            "POST",
            "register",
            422,  # Validation error
            data={"email": "test@test.com", "password": "123"}
        )
        
        # Test duplicate email
        if hasattr(self, 'test_email'):
            success2, _ = self.run_test(
                "Registration - Duplicate Email Validation",
                "POST",
                "register",
                400,
                data={"email": self.test_email, "password": "TestPass123!"}
            )
            return success and success2
        
        return success

    def test_login(self):
        """Test user login"""
        if not hasattr(self, 'test_email'):
            self.log_test("Login", False, "No test user created")
            return False
            
        success, response = self.run_test(
            "User Login",
            "POST",
            "login",
            200,
            data={"email": self.test_email, "password": self.test_password}
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   Token obtained: {self.token[:20]}...")
            return True
        
        self.log_test("Login", False, "No access token in response")
        return False

    def test_login_invalid(self):
        """Test login with invalid credentials"""
        success, _ = self.run_test(
            "Login - Invalid Credentials",
            "POST",
            "login",
            401,
            data={"email": "invalid@test.com", "password": "wrongpass"}
        )
        return success

    def test_get_me(self):
        """Test get current user"""
        if not self.token:
            self.log_test("Get Me", False, "No token available")
            return False
            
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "me",
            200
        )
        
        if success and 'email' in response:
            self.user_id = response.get('id')
            print(f"   User ID: {self.user_id}")
            return True
        
        return success

    def test_create_company(self):
        """Test company creation"""
        if not self.token:
            self.log_test("Create Company", False, "No token available")
            return False
            
        company_name = f"Test Company {datetime.now().strftime('%H%M%S')}"
        
        success, response = self.run_test(
            "Create Company",
            "POST",
            "companies",
            200,
            data={"name": company_name}
        )
        
        if success and 'id' in response:
            self.company_id = response['id']
            self.company_name = company_name
            print(f"   Company ID: {self.company_id}")
            return True
        
        return success

    def test_list_companies(self):
        """Test listing companies"""
        if not self.token:
            self.log_test("List Companies", False, "No token available")
            return False
            
        success, response = self.run_test(
            "List Companies",
            "GET",
            "companies",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} companies")
            return True
        
        return success

    def test_get_company(self):
        """Test getting specific company"""
        if not self.token or not self.company_id:
            self.log_test("Get Company", False, "No token or company ID available")
            return False
            
        success, response = self.run_test(
            "Get Company",
            "GET",
            f"companies/{self.company_id}",
            200
        )
        
        return success

    def test_add_financial_data(self):
        """Test adding financial data"""
        if not self.token or not self.company_id:
            self.log_test("Add Financial Data", False, "No token or company ID available")
            return False
            
        financial_data = {
            "period": "2024-01",
            "ingresos_netos": 100000.0,
            "costos_directos": 30000.0,
            "costos_fijos": 20000.0,
            "gastos_operativos": 15000.0,
            "utilidad_neta": 35000.0,
            "activo_corriente": 50000.0,
            "pasivo_corriente": 25000.0,
            "clientes_activos": 100,
            "clientes_nuevos": 20,
            "clientes_perdidos": 5,
            "horas_disponibles": 1600.0,
            "horas_facturadas": 1400.0,
            "gasto_comercial": 5000.0
        }
        
        success, response = self.run_test(
            "Add Financial Data",
            "POST",
            f"data/{self.company_id}",
            200,
            data=financial_data
        )
        
        if success:
            self.test_period = "2024-01"
            # Verify KPIs were calculated
            if 'kpis' in response:
                kpis = response['kpis']
                print(f"   KPIs calculated:")
                print(f"     Margen Neto: {kpis.get('margen_neto')}")
                print(f"     Liquidez Corriente: {kpis.get('liquidez_corriente')}")
                print(f"     Churn Rate: {kpis.get('churn_rate')}")
                print(f"     ARPU: {kpis.get('arpu')}")
                print(f"     LTV: {kpis.get('ltv')}")
                print(f"     CAC: {kpis.get('cac')}")
                
                # Verify specific KPI calculations
                expected_margen_neto = 35000.0 / 100000.0  # utilidad_neta / ingresos_netos
                expected_liquidez = 50000.0 / 25000.0  # activo_corriente / pasivo_corriente
                expected_churn = 5 / 100  # clientes_perdidos / clientes_activos
                expected_arpu = 100000.0 / 100  # ingresos_netos / clientes_activos
                
                if abs(kpis.get('margen_neto', 0) - expected_margen_neto) < 0.001:
                    print(f"   ✅ Margen Neto calculation correct")
                else:
                    print(f"   ❌ Margen Neto calculation incorrect: expected {expected_margen_neto}, got {kpis.get('margen_neto')}")
                
                if abs(kpis.get('liquidez_corriente', 0) - expected_liquidez) < 0.001:
                    print(f"   ✅ Liquidez Corriente calculation correct")
                else:
                    print(f"   ❌ Liquidez Corriente calculation incorrect: expected {expected_liquidez}, got {kpis.get('liquidez_corriente')}")
        
        return success

    def test_duplicate_period(self):
        """Test adding duplicate period data"""
        if not self.token or not self.company_id:
            self.log_test("Duplicate Period", False, "No token or company ID available")
            return False
            
        financial_data = {
            "period": "2024-01",  # Same period as before
            "ingresos_netos": 50000.0
        }
        
        success, _ = self.run_test(
            "Add Duplicate Period",
            "POST",
            f"data/{self.company_id}",
            409,  # Conflict
            data=financial_data
        )
        
        return success

    def test_get_dashboard(self):
        """Test getting dashboard data"""
        if not self.token or not self.company_id:
            self.log_test("Get Dashboard", False, "No token or company ID available")
            return False
            
        success, response = self.run_test(
            "Get Dashboard Data",
            "GET",
            f"dashboard/{self.company_id}",
            200
        )
        
        if success and isinstance(response, list) and len(response) > 0:
            print(f"   Found {len(response)} periods of data")
            first_period = response[0]
            if 'kpis' in first_period:
                print(f"   KPIs present in dashboard data")
            return True
        
        return success

    def test_get_summary(self):
        """Test getting summary data"""
        if not self.token or not self.company_id:
            self.log_test("Get Summary", False, "No token or company ID available")
            return False
            
        success, response = self.run_test(
            "Get Summary Data",
            "GET",
            f"summary/{self.company_id}",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Total periods: {response.get('total_periods')}")
            print(f"   Latest period: {response.get('latest_period')}")
            print(f"   Total revenue: {response.get('total_revenue')}")
            print(f"   Trend: {response.get('trend')}")
            return True
        
        return success

    def test_delete_data(self):
        """Test deleting financial data"""
        if not self.token or not self.company_id or not hasattr(self, 'test_period'):
            self.log_test("Delete Data", False, "No token, company ID, or test period available")
            return False
            
        success, _ = self.run_test(
            "Delete Financial Data",
            "DELETE",
            f"data/{self.company_id}/{self.test_period}",
            200
        )
        
        return success

    def test_delete_company(self):
        """Test deleting company"""
        if not self.token or not self.company_id:
            self.log_test("Delete Company", False, "No token or company ID available")
            return False
            
        success, _ = self.run_test(
            "Delete Company",
            "DELETE",
            f"companies/{self.company_id}",
            200
        )
        
        return success

    def test_unauthorized_access(self):
        """Test unauthorized access"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        success, _ = self.run_test(
            "Unauthorized Access",
            "GET",
            "companies",
            401
        )
        
        # Restore token
        self.token = original_token
        return success

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting SaaS Financiero Backend API Tests")
        print("=" * 60)
        
        # Basic tests
        self.test_health_check()
        
        # Authentication tests
        self.test_register()
        self.test_register_validation()
        self.test_login()
        self.test_login_invalid()
        self.test_get_me()
        self.test_unauthorized_access()
        
        # Company management tests
        self.test_create_company()
        self.test_list_companies()
        self.test_get_company()
        
        # Financial data tests
        self.test_add_financial_data()
        self.test_duplicate_period()
        self.test_get_dashboard()
        self.test_get_summary()
        
        # Cleanup tests
        self.test_delete_data()
        self.test_delete_company()
        
        # Print results
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("❌ Some tests failed!")
            print("\nFailed tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
            return 1

def main():
    tester = SaaSFinancieroTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())