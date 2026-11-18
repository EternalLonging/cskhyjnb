import base64
import os

from playwright.sync_api import sync_playwright


APP_URL = os.environ.get("QUIZ_APP_URL", "http://127.0.0.1:3000/")
REST_PATTERN = "**/rest/v1/study_progress*"


def main():
    archive_requests = []
    response_status = {"value": 201}

    def handle_rest(route, request):
        cors_headers = {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": (
                "apikey, authorization, content-type, prefer, x-quiz-sync-key"
            ),
            "content-type": "application/json",
        }
        if request.method == "OPTIONS":
            route.fulfill(status=204, headers=cors_headers, body="")
            return
        if request.method == "POST" and '"deck_key":"history:' in (request.post_data or ""):
            archive_requests.append(request)
            route.fulfill(status=response_status["value"], headers=cors_headers, body="{}")
            return
        route.fulfill(status=200, headers=cors_headers, body="[]")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context()
        context.add_init_script(
            """
            localStorage.setItem('quiz_access_mode_v1', 'single');
            localStorage.setItem('quiz_sync_invite_authorized_v1', '{"__single_mode__":true}');
            sessionStorage.setItem('quiz_admin_unlocked_v1', 'ok');
            """
        )
        page = context.new_page()
        page.route(REST_PATTERN, handle_rest)
        page.goto(APP_URL, wait_until="domcontentloaded")
        page.wait_for_function("typeof archiveRoundCloudBeacon === 'function'")
        page.evaluate(
            """
            syncState.enabled = true;
            syncState.key = '\u540c\u6b65\u7801-\u6d4b\u8bd5';
            window.__archiveFetchOptions = [];
            window.__archiveTrimCalls = 0;
            const nativeFetch = window.fetch.bind(window);
            window.fetch = (url, options = {}) => {
              if (String(url).includes('/rest/v1/study_progress') && options.method === 'POST') {
                window.__archiveFetchOptions.push({
                  hasKeepalive: Object.prototype.hasOwnProperty.call(options, 'keepalive'),
                  keepalive: options.keepalive === true,
                });
              }
              return nativeFetch(url, options);
            };
            trimHistoryCloud = async () => { window.__archiveTrimCalls += 1; };
            localStorage.removeItem('quiz_pending_history_archive_v1');
            """
        )

        normal_result = page.evaluate(
            """
            archiveRoundCloudBeacon({
              id: 'history:1700000000101', roundId: 1700000000101,
              savedAt: 1700000000101, pool: [{id: 'q1', text: 'question'}],
              history: [{id: 'q1', roundIndex: 0, result: 'right'}],
              _historyMeta: {finished: false, createdAt: 1700000000101}
            })
            """
        )
        assert normal_result is True
        normal_options = page.evaluate("window.__archiveFetchOptions.at(-1)")
        assert normal_options == {"hasKeepalive": False, "keepalive": False}
        expected_header = base64.b64encode("\u540c\u6b65\u7801-\u6d4b\u8bd5".encode()).decode()
        assert archive_requests[-1].headers["x-quiz-sync-key"] == expected_header
        assert page.evaluate("window.__archiveTrimCalls") == 1

        response_status["value"] = 401
        page.evaluate("window.__archiveTrimCalls = 0")
        failed_result = page.evaluate(
            """
            archiveRoundCloudBeacon({
              id: 'history:1700000000102', roundId: 1700000000102,
              savedAt: 1700000000102, pool: [{id: 'q2', text: 'question'}],
              history: [{id: 'q2', roundIndex: 0, result: 'wrong'}],
              _historyMeta: {finished: false, createdAt: 1700000000102}
            })
            """
        )
        assert failed_result is False
        assert page.evaluate("window.__archiveTrimCalls") == 0
        assert page.evaluate("Boolean(localStorage.getItem('quiz_pending_history_archive_v1'))")

        response_status["value"] = 201
        page.evaluate("localStorage.removeItem('quiz_pending_history_archive_v1')")
        boundary_result = page.evaluate(
            """
            (() => {
              const record = {
                id: 'history:1700000000103', roundId: 1700000000103,
                savedAt: 1700000000103, pool: [{id: 'q3', text: ''}],
                history: [{id: 'q3', roundIndex: 0, result: 'right'}],
                _historyMeta: {finished: false, createdAt: 1700000000103}
              };
              const wrap = () => JSON.stringify({
                sync_key: syncState.key, deck_key: record.id, state: record,
                updated_at: new Date(record.savedAt).toISOString()
              });
              record.pool[0].text = 'a'.repeat(60 * 1024 - utf8ByteLength(wrap()));
              if (utf8ByteLength(wrap()) !== 60 * 1024) throw new Error('bad boundary fixture');
              return archiveRoundCloudBeacon(record, {unload: true});
            })()
            """
        )
        assert boundary_result is True
        boundary_options = page.evaluate("window.__archiveFetchOptions.at(-1)")
        assert boundary_options == {"hasKeepalive": True, "keepalive": True}

        requests_before_large = len(archive_requests)
        large_result = page.evaluate(
            """
            archiveRoundCloudBeacon({
              id: 'history:1700000000104', roundId: 1700000000104,
              savedAt: 1700000000104, pool: [{id: 'q4', text: '\u9898'.repeat(25000)}],
              history: [{id: 'q4', roundIndex: 0, result: 'right'}],
              _historyMeta: {finished: false, createdAt: 1700000000104}
            }, {unload: true})
            """
        )
        assert large_result is False
        assert len(archive_requests) == requests_before_large
        assert page.evaluate("Boolean(localStorage.getItem('quiz_pending_history_archive_v1'))")

        retry_result = page.evaluate("retryPendingHistoryArchive()")
        assert retry_result is True
        retry_options = page.evaluate("window.__archiveFetchOptions.at(-1)")
        assert retry_options == {"hasKeepalive": False, "keepalive": False}
        assert page.evaluate("localStorage.getItem('quiz_pending_history_archive_v1')") is None

        browser.close()
        print("history archive browser checks passed")


if __name__ == "__main__":
    main()
