"""Cross-user data isolation tests (BE-13) -- the single most important test
class in this phase. Two real users, two real tokens, against a real
(temporary) database: User B must never be able to read, list, or mutate
User A's data through any endpoint that existed before multi-tenant support.
"""


def auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def signup(client, email, password="testpass123"):
    resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert resp.status_code == 201
    return resp.json()["access_token"]


class TestResumeIsolation:
    def test_user_b_cannot_see_user_a_resume(self, client):
        token_a = signup(client, "resume-a@example.com")
        token_b = signup(client, "resume-b@example.com")

        client.post(
            "/api/resume",
            data={"text": "User A's private resume content."},
            headers=auth_headers(token_a),
        )

        # User B has never uploaded a resume -- must see 404, not User A's.
        resp = client.get("/api/resume", headers=auth_headers(token_b))
        assert resp.status_code == 404

    def test_each_user_saving_a_resume_does_not_affect_the_other(self, client):
        token_a = signup(client, "resume-a2@example.com")
        token_b = signup(client, "resume-b2@example.com")

        client.post(
            "/api/resume", data={"text": "Resume A"}, headers=auth_headers(token_a)
        )
        client.post(
            "/api/resume", data={"text": "Resume B"}, headers=auth_headers(token_b)
        )

        resume_a = client.get("/api/resume", headers=auth_headers(token_a)).json()
        resume_b = client.get("/api/resume", headers=auth_headers(token_b)).json()

        assert resume_a["raw_text"] == "Resume A"
        assert resume_b["raw_text"] == "Resume B"


class TestJobIsolation:
    def _create_job_for(self, client, token, jd_text="We need a backend engineer."):
        # No OpenAI key is configured for these test users, so analysis
        # degrades gracefully (job still saved, match_error set) -- exactly
        # what BE-12 designed for, and convenient here since it means these
        # tests never need a real OpenAI key.
        resp = client.post("/api/jobs", data={"jd_text": jd_text}, headers=auth_headers(token))
        assert resp.status_code == 201
        return resp.json()["job"]["id"]

    def test_user_b_cannot_list_user_a_jobs(self, client):
        token_a = signup(client, "jobs-a@example.com")
        token_b = signup(client, "jobs-b@example.com")

        client.post("/api/resume", data={"text": "Resume A"}, headers=auth_headers(token_a))
        self._create_job_for(client, token_a)

        jobs_b = client.get("/api/jobs", headers=auth_headers(token_b)).json()
        assert jobs_b == []

    def test_user_b_cannot_fetch_user_a_job_by_id(self, client):
        token_a = signup(client, "jobs-a2@example.com")
        token_b = signup(client, "jobs-b2@example.com")

        client.post("/api/resume", data={"text": "Resume A"}, headers=auth_headers(token_a))
        job_id = self._create_job_for(client, token_a)

        # Same job id, wrong user's token -- must behave identically to a
        # job id that doesn't exist at all (404, not 403 -- doesn't even
        # confirm the id is valid for someone else).
        resp = client.get(f"/api/jobs/{job_id}", headers=auth_headers(token_b))
        assert resp.status_code == 404

    def test_user_b_cannot_update_user_a_job_status(self, client):
        token_a = signup(client, "jobs-a3@example.com")
        token_b = signup(client, "jobs-b3@example.com")

        client.post("/api/resume", data={"text": "Resume A"}, headers=auth_headers(token_a))
        job_id = self._create_job_for(client, token_a)

        resp = client.patch(
            f"/api/jobs/{job_id}", json={"status": "applied"}, headers=auth_headers(token_b)
        )
        assert resp.status_code == 404

        # Confirm the status genuinely did not change under the hood --
        # not just that the PATCH response looked right.
        job_a_view = client.get(f"/api/jobs/{job_id}", headers=auth_headers(token_a)).json()
        assert job_a_view["job"]["status"] == "saved"

    def test_each_user_only_sees_their_own_jobs_in_a_mixed_list(self, client):
        token_a = signup(client, "jobs-a4@example.com")
        token_b = signup(client, "jobs-b4@example.com")

        client.post("/api/resume", data={"text": "Resume A"}, headers=auth_headers(token_a))
        client.post("/api/resume", data={"text": "Resume B"}, headers=auth_headers(token_b))

        self._create_job_for(client, token_a, "Job A1")
        self._create_job_for(client, token_a, "Job A2")
        self._create_job_for(client, token_b, "Job B1")

        jobs_a = client.get("/api/jobs", headers=auth_headers(token_a)).json()
        jobs_b = client.get("/api/jobs", headers=auth_headers(token_b)).json()

        assert len(jobs_a) == 2
        assert len(jobs_b) == 1
        assert {j["jd_raw_text"] for j in jobs_a} == {"Job A1", "Job A2"}
        assert jobs_b[0]["jd_raw_text"] == "Job B1"


class TestSettingsIsolation:
    def test_user_b_does_not_see_user_a_api_key(self, client):
        token_a = signup(client, "settings-a@example.com")
        token_b = signup(client, "settings-b@example.com")

        client.patch(
            "/api/auth/me",
            json={"openai_api_key": "sk-useraskeyABCDEFGH1234"},
            headers=auth_headers(token_a),
        )

        me_b = client.get("/api/auth/me", headers=auth_headers(token_b)).json()
        assert me_b["openai_api_key_masked"] is None
