import os

from playwright.sync_api import sync_playwright


APP_URL = os.environ.get("QUIZ_APP_URL", "http://127.0.0.1:3000/")


def fulfill_supabase(route, request):
    headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "access-control-allow-headers": (
            "apikey, authorization, content-type, prefer, x-quiz-sync-key"
        ),
        "content-type": "application/json",
    }
    if request.method == "OPTIONS":
        route.fulfill(status=204, headers=headers, body="")
    else:
        route.fulfill(status=200, headers=headers, body="[]")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1365, "height": 900})
        context.add_init_script(
            """
            localStorage.setItem('quiz_access_mode_v1', 'single');
            localStorage.setItem(
              'quiz_sync_invite_authorized_v1',
              JSON.stringify({'__single_mode__': true})
            );
            """
        )

        failures = []

        def new_page():
            page = context.new_page()
            page.route("**/rest/v1/**", fulfill_supabase)
            page.on("pageerror", lambda error: failures.append(f"pageerror: {error}"))
            page.on(
                "console",
                lambda message: failures.append(f"console error: {message.text}")
                if message.type == "error"
                else None,
            )
            return page

        home = new_page()
        home.goto(APP_URL, wait_until="domcontentloaded")
        home.wait_for_function(
            """
            document.querySelector('#restartHomeBtn') &&
            !document.querySelector('#restartHomeBtn').disabled &&
            Number(document.querySelector('#totalCount')?.textContent || 0) > 0 &&
            document.querySelectorAll('#topicList .topic-course-card').length > 0
            """
        )
        assert home.locator("#historyRecordsBtn").is_visible()

        practice = new_page()
        practice.goto(f"{APP_URL.rstrip('/')}/practice.html", wait_until="domcontentloaded")
        practice.wait_for_function(
            """
            document.querySelector('#questionCard') &&
            !document.querySelector('#questionCard').classList.contains('hidden') &&
            document.querySelector('#questionText').textContent.trim().length > 0 &&
            Number(document.querySelector('#topicPill').textContent.match(/\\d+/)?.[0] || 0) > 0
            """
        )
        assert practice.locator("#backHomeBtn").is_visible()
        assert practice.locator("#restartBtn").is_visible()

        if failures:
            raise AssertionError("\n".join(failures))

        browser.close()
        print("home and practice browser smoke checks passed")


if __name__ == "__main__":
    main()
