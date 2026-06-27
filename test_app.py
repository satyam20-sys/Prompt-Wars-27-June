"""Unit tests for the ExamZen Flask backend app.

All external Gemini API calls are mocked using unittest.mock.
"""

import json
import os
import unittest
from unittest.mock import patch

# Set dummy environment variable before importing app to satisfy before_request check
os.environ["GEMINI_API_KEY"] = "mock-api-key-value"

import app

TEST_DATA_FILE = "test_journal_data.json"


class ExamZenTestCase(unittest.TestCase):
    """Test suite for validating ExamZen backend APIs."""

    def setUp(self):
        """Pre-test configuration.

        Redirects database write file and cleans pre-existing databases.
        """
        app.DATA_FILE = TEST_DATA_FILE
        if os.path.exists(TEST_DATA_FILE):
            os.remove(TEST_DATA_FILE)
        # Ensure the test database starts as clean empty array
        app.write_journal_data([])
        self.client = app.app.test_client()

    def tearDown(self):
        """Cleans up the generated test database after each test."""
        if os.path.exists(TEST_DATA_FILE):
            os.remove(TEST_DATA_FILE)

    def test_journal_save(self):
        """POST a real entry -> 200/201 and verify stored content in JSON."""
        payload = {
            "text": "Studied for GATE all night, feel so nervous about math topics.",
            "mood": "😰",
            "exam": "GATE",
            "exam_date": "2026-02-08"
        }
        response = self.client.post("/journal", json=payload)
        self.assertEqual(response.status_code, 201)
        
        data = response.get_json()
        self.assertIn("id", data)
        self.assertEqual(data["text"], payload["text"])
        self.assertEqual(data["mood"], payload["mood"])
        self.assertEqual(data["exam"], payload["exam"])
        self.assertIsNone(data["stress_level"])
        self.assertEqual(data["emotions"], [])
        
        # Verify JSON file has been written
        saved_entries = app.read_journal_data()
        self.assertEqual(len(saved_entries), 1)
        self.assertEqual(saved_entries[0]["id"], data["id"])

    def test_empty_journal_rejected(self):
        """POST with empty text or missing params -> 400 Bad Request."""
        # Case 1: Empty text
        payload = {
            "text": "   ",
            "mood": "😐",
            "exam": "JEE"
        }
        response = self.client.post("/journal", json=payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())
        
        # Case 2: Missing mood
        payload = {
            "text": "Some text",
            "exam": "JEE"
        }
        response = self.client.post("/journal", json=payload)
        self.assertEqual(response.status_code, 400)

    @patch("app.call_gemini_json")
    def test_analyze_returns_all_keys(self, mock_gemini):
        """POST to /analyze -> returns all 8 keys and updates db."""
        # 1. Save a journal entry
        save_payload = {
            "text": "NEET test scores are down. Peer pressure is high.",
            "mood": "😔",
            "exam": "NEET"
        }
        save_res = self.client.post("/journal", json=save_payload)
        entry_id = save_res.get_json()["id"]
        
        # 2. Setup mock response with all 8 required keys
        mock_response = {
            "stress_level": 8,
            "detected_emotions": ["anxious", "pressured", "disappointed"],
            "hidden_triggers": ["mock test scores", "peer comparison"],
            "coping_strategy": "Try dividing chapters into small topics. Focus on weaknesses.",
            "mindfulness_exercise": "Take a 5-minute deep breathing break.",
            "motivational_message": "NEET is tough, but you are tougher. Step by step.",
            "india_context": "In India, competition for medical seats creates immense pressure.",
            "safety_flag": False
        }
        mock_gemini.return_value = mock_response
        
        # 3. Request analysis
        response = self.client.post("/analyze", json={"id": entry_id})
        self.assertEqual(response.status_code, 200)
        
        data = response.get_json()
        for key in mock_response:
            self.assertIn(key, data)
            self.assertEqual(data[key], mock_response[key])
            
        # 4. Verify DB was updated
        updated_entries = app.read_journal_data()
        self.assertEqual(updated_entries[0]["stress_level"], 8)
        self.assertEqual(updated_entries[0]["emotions"], ["anxious", "pressured", "disappointed"])

    @patch("app.call_gemini_json")
    def test_safety_flag_detection(self, mock_gemini):
        """POST to /analyze with crisis text -> returns safety_flag true."""
        # 1. Save entry
        save_payload = {
            "text": "I feel like ending my life. I cannot deal with UPSC failure.",
            "mood": "😰",
            "exam": "UPSC"
        }
        save_res = self.client.post("/journal", json=save_payload)
        entry_id = save_res.get_json()["id"]
        
        # 2. Mock response with safety_flag=True
        mock_gemini.return_value = {
            "stress_level": 10,
            "detected_emotions": ["hopeless", "overwhelmed", "terrified"],
            "hidden_triggers": ["UPSC failure expectation", "extreme stress"],
            "coping_strategy": "Please stop studying and talk to someone you trust immediately.",
            "mindfulness_exercise": "Call a support line.",
            "motivational_message": "Your life is worth infinitely more than any exam.",
            "india_context": "UPSC pressure leads to severe isolation.",
            "safety_flag": True
        }
        
        response = self.client.post("/analyze", json={"id": entry_id})
        self.assertEqual(response.status_code, 200)
        
        data = response.get_json()
        self.assertTrue(data["safety_flag"])

    def test_burnout_with_no_entries(self):
        """POST to /burnout-predict with < 3 entries -> insufficient_data."""
        # 0 entries
        response = self.client.post("/burnout-predict")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json().get("insufficient_data"))
        
        # 2 entries
        self.client.post("/journal", json={"text": "Prep day 1", "mood": "😐", "exam": "JEE"})
        self.client.post("/journal", json={"text": "Prep day 2", "mood": "😊", "exam": "JEE"})
        
        response = self.client.post("/burnout-predict")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json().get("insufficient_data"))

    @patch("app.call_gemini_json")
    def test_burnout_with_entries(self, mock_gemini):
        """POST to /burnout-predict with 3+ entries -> returns burnout_risk."""
        # 1. Save 3 entries
        self.client.post("/journal", json={"text": "Entry 1 text", "mood": "😐", "exam": "JEE"})
        self.client.post("/journal", json={"text": "Entry 2 text", "mood": "😔", "exam": "JEE"})
        self.client.post("/journal", json={"text": "Entry 3 text", "mood": "😰", "exam": "JEE"})
        
        # 2. Mock
        mock_gemini.return_value = {
            "burnout_risk": "critical",
            "days_until_burnout": 5,
            "warning_signs": ["sleep deprivation", "severe anxiety", "isolation"],
            "intervention": "1. Halt studies. 2. Sleep 8 hours. 3. Connect with peers."
        }
        
        response = self.client.post("/burnout-predict")
        self.assertEqual(response.status_code, 200)
        
        data = response.get_json()
        self.assertEqual(data["burnout_risk"], "critical")
        self.assertEqual(data["days_until_burnout"], 5)
        self.assertIn("sleep deprivation", data["warning_signs"])

    def test_stress_dna_no_entries(self):
        """POST to /stress-dna with 0 entries -> insufficient_data."""
        response = self.client.post("/stress-dna")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json().get("insufficient_data"))

    @patch("app.call_gemini_json")
    def test_stress_dna_with_entries(self, mock_gemini):
        """POST to /stress-dna with 1+ entry -> returns Stress DNA fields."""
        # 1. Save 1 entry
        self.client.post("/journal", json={"text": "JEE test anxiety", "mood": "😰", "exam": "JEE"})
        
        # 2. Mock
        mock_gemini.return_value = {
            "primary_stressor": "Competitive Mock Scores",
            "stress_pattern": "Spikes after weekly tests",
            "emotional_default": "Anxiety and self-doubt",
            "personalized_mantra": "Karmanye Vadhikaraste Ma Phaleshu Kadachana",
            "weekly_wins": ["Faced mock review without crying"],
            "next_week_focus": "Attempt 30 minutes of meditation before test"
        }
        
        response = self.client.post("/stress-dna")
        self.assertEqual(response.status_code, 200)
        
        data = response.get_json()
        self.assertEqual(data["primary_stressor"], "Competitive Mock Scores")
        self.assertEqual(data["personalized_mantra"], "Karmanye Vadhikaraste Ma Phaleshu Kadachana")

    def test_dashboard_empty(self):
        """GET to /dashboard with 0 entries -> empty:true, no data invented."""
        response = self.client.get("/dashboard")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["empty"])
        self.assertEqual(data["entries"], [])

    @patch("app.call_gemini_text")
    def test_panic_button(self, mock_gemini):
        """GET /panic-button -> returns plain text coping exercise."""
        mock_gemini.return_value = "Box Breathing: Inhale 4s, Hold 4s, Exhale 4s, Hold 4s."
        
        response = self.client.get("/panic-button")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Content-Type"], "text/plain; charset=utf-8")
        self.assertEqual(response.get_data(as_text=True), "Box Breathing: Inhale 4s, Hold 4s, Exhale 4s, Hold 4s.")


if __name__ == "__main__":
    unittest.main()
