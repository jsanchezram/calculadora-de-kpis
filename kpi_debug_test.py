import requests
import json

# Test KPI calculation by creating a user, company, and adding data
BASE_URL = "https://bizmetrics-22.preview.emergentagent.com/api"

def test_kpi_calculation():
    print("🔍 Testing KPI Calculation and Display")
    
    # 1. Register user
    test_email = "kpi_test@test.com"
    test_password = "TestPass123!"
    
    register_response = requests.post(f"{BASE_URL}/register", json={
        "email": test_email,
        "password": test_password
    })
    
    if register_response.status_code != 200:
        print("Registration failed, trying to login with existing user")
    
    # 2. Login
    login_response = requests.post(f"{BASE_URL}/login", json={
        "email": test_email,
        "password": test_password
    })
    
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.text}")
        return
    
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    print("✅ Login successful")
    
    # 3. Create company
    company_response = requests.post(f"{BASE_URL}/companies", 
        json={"name": "KPI Test Company"}, 
        headers=headers
    )
    
    if company_response.status_code != 200:
        print(f"❌ Company creation failed: {company_response.text}")
        return
    
    company_id = company_response.json()["id"]
    print(f"✅ Company created: {company_id}")
    
    # 4. Add financial data
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
    
    data_response = requests.post(f"{BASE_URL}/data/{company_id}", 
        json=financial_data, 
        headers=headers
    )
    
    if data_response.status_code != 200:
        print(f"❌ Data addition failed: {data_response.text}")
        return
    
    print("✅ Financial data added")
    print("KPIs calculated:")
    kpis = data_response.json().get("kpis", {})
    for kpi_name, kpi_value in kpis.items():
        print(f"  {kpi_name}: {kpi_value}")
    
    # 5. Get dashboard data
    dashboard_response = requests.get(f"{BASE_URL}/dashboard/{company_id}", headers=headers)
    
    if dashboard_response.status_code != 200:
        print(f"❌ Dashboard fetch failed: {dashboard_response.text}")
        return
    
    dashboard_data = dashboard_response.json()
    print(f"\n✅ Dashboard data retrieved: {len(dashboard_data)} periods")
    
    if dashboard_data:
        latest_data = dashboard_data[0]
        print("Latest period KPIs:")
        latest_kpis = latest_data.get("kpis", {})
        for kpi_name, kpi_value in latest_kpis.items():
            print(f"  {kpi_name}: {kpi_value}")
    
    # 6. Get summary data
    summary_response = requests.get(f"{BASE_URL}/summary/{company_id}", headers=headers)
    
    if summary_response.status_code != 200:
        print(f"❌ Summary fetch failed: {summary_response.text}")
        return
    
    summary_data = summary_response.json()
    print(f"\n✅ Summary data retrieved")
    print(f"Latest KPIs from summary:")
    latest_kpis_summary = summary_data.get("latest_kpis", {})
    for kpi_name, kpi_value in latest_kpis_summary.items():
        print(f"  {kpi_name}: {kpi_value}")
    
    # Cleanup
    requests.delete(f"{BASE_URL}/companies/{company_id}", headers=headers)
    print(f"\n🧹 Cleanup completed")

if __name__ == "__main__":
    test_kpi_calculation()