"""
GJC AI-CRM Backend API Tests
Tests for: Dashboard, Candidates, Companies, Immigration Cases, Alerts, Pipeline, Documents
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndDashboard:
    """Health check and Dashboard KPI tests"""
    
    def test_health_endpoint(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["version"] == "2.0"
        assert data["database"] == "connected"
    
    def test_root_endpoint(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "GJC AI-CRM API" in data["message"]
    
    def test_dashboard_kpis(self):
        """Test dashboard returns correct KPIs - 315 candidates, 37 companies, 75 cases, 1 alert"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Verify KPIs structure
        assert "kpis" in data
        kpis = data["kpis"]
        
        # Verify expected counts from imported Excel data
        assert kpis["total_candidates"] == 315, f"Expected 315 candidates, got {kpis['total_candidates']}"
        assert kpis["total_companies"] == 37, f"Expected 37 companies, got {kpis['total_companies']}"
        assert kpis["total_cases"] == 75, f"Expected 75 cases, got {kpis['total_cases']}"
        assert kpis["total_alerts"] == 1, f"Expected 1 alert, got {kpis['total_alerts']}"
        
        # Verify nationalities breakdown
        assert "nationalities" in data
        assert len(data["nationalities"]) > 0
        
        # Verify top companies
        assert "top_companies" in data
        assert len(data["top_companies"]) > 0


class TestCandidatesModule:
    """Candidates CRUD and search tests"""
    
    def test_get_all_candidates(self):
        """Test getting all 315 candidates"""
        response = requests.get(f"{BASE_URL}/api/candidates")
        assert response.status_code == 200
        candidates = response.json()
        assert len(candidates) == 315, f"Expected 315 candidates, got {len(candidates)}"
    
    def test_candidate_structure(self):
        """Test candidate data structure"""
        response = requests.get(f"{BASE_URL}/api/candidates")
        assert response.status_code == 200
        candidates = response.json()
        
        if candidates:
            candidate = candidates[0]
            # Verify required fields
            assert "id" in candidate
            assert "first_name" in candidate
            assert "last_name" in candidate
            assert "nationality" in candidate
            assert "status" in candidate
    
    def test_search_candidates(self):
        """Test candidate search functionality"""
        response = requests.get(f"{BASE_URL}/api/candidates?search=Nepal")
        assert response.status_code == 200
        # Search should work without errors
    
    def test_filter_by_nationality(self):
        """Test filtering candidates by nationality"""
        response = requests.get(f"{BASE_URL}/api/candidates?nationality=Nepal")
        assert response.status_code == 200
        candidates = response.json()
        # All returned candidates should be from Nepal
        for c in candidates:
            assert c["nationality"] == "Nepal"
    
    def test_get_candidate_by_id(self):
        """Test getting a specific candidate"""
        # First get all candidates
        response = requests.get(f"{BASE_URL}/api/candidates")
        candidates = response.json()
        
        if candidates:
            candidate_id = candidates[0]["id"]
            response = requests.get(f"{BASE_URL}/api/candidates/{candidate_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == candidate_id
    
    def test_get_nonexistent_candidate(self):
        """Test 404 for non-existent candidate"""
        response = requests.get(f"{BASE_URL}/api/candidates/nonexistent-id-12345")
        assert response.status_code == 404
    
    def test_create_and_delete_candidate(self):
        """Test creating and deleting a candidate"""
        # Create
        new_candidate = {
            "first_name": "TEST_John",
            "last_name": "TEST_Doe",
            "nationality": "Nepal",
            "status": "activ"
        }
        response = requests.post(f"{BASE_URL}/api/candidates", json=new_candidate)
        assert response.status_code == 200
        created = response.json()
        assert created["first_name"] == "TEST_John"
        assert "id" in created
        
        # Verify persistence with GET
        get_response = requests.get(f"{BASE_URL}/api/candidates/{created['id']}")
        assert get_response.status_code == 200
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/candidates/{created['id']}")
        assert delete_response.status_code == 200
        
        # Verify deletion
        verify_response = requests.get(f"{BASE_URL}/api/candidates/{created['id']}")
        assert verify_response.status_code == 404


class TestCompaniesModule:
    """Companies CRUD and ANAF lookup tests"""
    
    def test_get_all_companies(self):
        """Test getting all 37 companies"""
        response = requests.get(f"{BASE_URL}/api/companies")
        assert response.status_code == 200
        companies = response.json()
        assert len(companies) == 37, f"Expected 37 companies, got {len(companies)}"
    
    def test_company_structure(self):
        """Test company data structure"""
        response = requests.get(f"{BASE_URL}/api/companies")
        assert response.status_code == 200
        companies = response.json()
        
        if companies:
            company = companies[0]
            assert "id" in company
            assert "name" in company
            assert "status" in company
    
    def test_search_companies(self):
        """Test company search functionality"""
        response = requests.get(f"{BASE_URL}/api/companies?search=Vinci")
        assert response.status_code == 200
        companies = response.json()
        # Should find Da Vinci Construct
        assert any("Vinci" in c["name"] for c in companies)
    
    def test_get_company_by_id(self):
        """Test getting a specific company"""
        response = requests.get(f"{BASE_URL}/api/companies")
        companies = response.json()
        
        if companies:
            company_id = companies[0]["id"]
            response = requests.get(f"{BASE_URL}/api/companies/{company_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == company_id
    
    def test_anaf_lookup_invalid_cui(self):
        """Test ANAF lookup with invalid CUI"""
        response = requests.get(f"{BASE_URL}/api/anaf/invalid123")
        assert response.status_code == 200
        data = response.json()
        # Should return error for invalid CUI
        assert data.get("success") == False or "error" in data
    
    def test_create_and_delete_company(self):
        """Test creating and deleting a company"""
        # Create
        new_company = {
            "name": "TEST_Company SRL",
            "cui": "RO99999999",
            "city": "București",
            "status": "activ"
        }
        response = requests.post(f"{BASE_URL}/api/companies", json=new_company)
        assert response.status_code == 200
        created = response.json()
        assert created["name"] == "TEST_Company SRL"
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/companies/{created['id']}")
        assert delete_response.status_code == 200


class TestImmigrationModule:
    """Immigration cases tests with 8 stages"""
    
    def test_get_all_cases(self):
        """Test getting all 75 immigration cases"""
        response = requests.get(f"{BASE_URL}/api/immigration")
        assert response.status_code == 200
        cases = response.json()
        assert len(cases) == 75, f"Expected 75 cases, got {len(cases)}"
    
    def test_case_structure(self):
        """Test immigration case data structure"""
        response = requests.get(f"{BASE_URL}/api/immigration")
        assert response.status_code == 200
        cases = response.json()
        
        if cases:
            case = cases[0]
            assert "id" in case
            assert "candidate_id" in case
            assert "case_type" in case
            assert "status" in case
            assert "current_stage" in case
    
    def test_immigration_stages(self):
        """Test getting immigration stages - should be 8 stages in Romanian"""
        response = requests.get(f"{BASE_URL}/api/immigration/stages")
        assert response.status_code == 200
        data = response.json()
        
        assert "stages" in data
        stages = data["stages"]
        assert len(stages) == 8, f"Expected 8 stages, got {len(stages)}"
        
        # Verify Romanian stage names
        expected_stages = [
            "Recrutat",
            "Documente Pregatite",
            "Permis Munca Depus",
            "Permis Munca Aprobat",
            "Viza Depusa",
            "Viza Aprobata",
            "Sosit Romania",
            "Permis Sedere"
        ]
        assert stages == expected_stages
    
    def test_create_and_advance_case(self):
        """Test creating and advancing an immigration case"""
        # First get a candidate
        candidates_response = requests.get(f"{BASE_URL}/api/candidates")
        candidates = candidates_response.json()
        
        if candidates:
            # Create case
            new_case = {
                "candidate_id": candidates[0]["id"],
                "candidate_name": f"{candidates[0]['first_name']} {candidates[0]['last_name']}",
                "case_type": "Permis de muncă",
                "status": "initiat"
            }
            response = requests.post(f"{BASE_URL}/api/immigration", json=new_case)
            assert response.status_code == 200
            created = response.json()
            assert created["current_stage"] == 1
            
            # Advance case
            advance_response = requests.patch(f"{BASE_URL}/api/immigration/{created['id']}/advance")
            assert advance_response.status_code == 200
            advance_data = advance_response.json()
            assert advance_data["current_stage"] == 2
            
            # Delete test case
            requests.delete(f"{BASE_URL}/api/immigration/{created['id']}")


class TestAlertsModule:
    """Alerts system tests - grouped by priority"""
    
    def test_get_all_alerts(self):
        """Test getting alerts - should have 1 alert for expired passport"""
        response = requests.get(f"{BASE_URL}/api/alerts")
        assert response.status_code == 200
        alerts = response.json()
        assert len(alerts) == 1, f"Expected 1 alert, got {len(alerts)}"
    
    def test_alert_structure(self):
        """Test alert data structure"""
        response = requests.get(f"{BASE_URL}/api/alerts")
        assert response.status_code == 200
        alerts = response.json()
        
        if alerts:
            alert = alerts[0]
            assert "id" in alert
            assert "type" in alert
            assert "entity_name" in alert
            assert "message" in alert
            assert "priority" in alert
            assert "days_until_expiry" in alert
    
    def test_alert_for_expired_passport(self):
        """Test the specific alert for Adedeji Adeniji Oluwaseyi"""
        response = requests.get(f"{BASE_URL}/api/alerts")
        assert response.status_code == 200
        alerts = response.json()
        
        # Find the expected alert
        expired_alert = next((a for a in alerts if "Adedeji" in a["entity_name"]), None)
        assert expired_alert is not None, "Expected alert for Adedeji Adeniji Oluwaseyi"
        assert expired_alert["type"] == "passport_expiry"
        assert expired_alert["priority"] == "urgent"
        assert expired_alert["days_until_expiry"] < 0  # Already expired


class TestPipelineModule:
    """Pipeline/Sales opportunities tests"""
    
    def test_get_pipeline(self):
        """Test getting pipeline opportunities"""
        response = requests.get(f"{BASE_URL}/api/pipeline")
        assert response.status_code == 200
        # Pipeline may be empty if no seed data
    
    def test_create_and_delete_opportunity(self):
        """Test creating and deleting a pipeline opportunity"""
        # Get a company first
        companies_response = requests.get(f"{BASE_URL}/api/companies")
        companies = companies_response.json()
        
        if companies:
            new_opp = {
                "title": "TEST_Opportunity",
                "company_id": companies[0]["id"],
                "company_name": companies[0]["name"],
                "stage": "lead",
                "value": 10000,
                "positions": 5,
                "probability": 50
            }
            response = requests.post(f"{BASE_URL}/api/pipeline", json=new_opp)
            assert response.status_code == 200
            created = response.json()
            assert created["title"] == "TEST_Opportunity"
            
            # Delete
            requests.delete(f"{BASE_URL}/api/pipeline/{created['id']}")


class TestDocumentsModule:
    """Documents management tests"""
    
    def test_get_documents(self):
        """Test getting documents"""
        response = requests.get(f"{BASE_URL}/api/documents")
        assert response.status_code == 200
        # Documents may be empty
    
    def test_create_and_delete_document(self):
        """Test creating and deleting a document"""
        candidates_response = requests.get(f"{BASE_URL}/api/candidates")
        candidates = candidates_response.json()
        
        if candidates:
            new_doc = {
                "candidate_id": candidates[0]["id"],
                "candidate_name": f"{candidates[0]['first_name']} {candidates[0]['last_name']}",
                "doc_type": "Pașaport",
                "file_name": "TEST_passport.pdf",
                "status": "valid"
            }
            response = requests.post(f"{BASE_URL}/api/documents", json=new_doc)
            assert response.status_code == 200
            created = response.json()
            
            # Delete
            requests.delete(f"{BASE_URL}/api/documents/{created['id']}")


class TestCandidateAlerts:
    """Candidate-specific alerts endpoint tests"""
    
    def test_get_candidate_alerts(self):
        """Test getting candidate alerts endpoint"""
        response = requests.get(f"{BASE_URL}/api/candidates/alerts")
        assert response.status_code == 200
        # This endpoint returns alerts for candidates with expiring documents


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
