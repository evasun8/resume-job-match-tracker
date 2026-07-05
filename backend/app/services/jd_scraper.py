"""Server-side Playwright scraping of a job posting URL (BE-10).

Exposes fetch_page_text(url) -> (page_text, title_hint). Raises ScrapeError
on any failure with a message that is safe to surface to the client.
"""
import ipaddress
import logging
import socket
from urllib.parse import urlparse

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

_NAV_TIMEOUT_MS = 20_000
_IDLE_TIMEOUT_MS = 10_000
_MAX_PAGE_TEXT_CHARS = 20_000
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


class ScrapeError(Exception):
    """Raised when the job posting page cannot be fetched. Message is safe to
    surface to callers/clients."""


def _validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ScrapeError("Enter a valid http(s) job posting URL.")
    if not parsed.hostname:
        raise ScrapeError("Enter a valid http(s) job posting URL.")

    hostname = parsed.hostname.lower()
    if hostname in ("localhost",) or hostname.endswith(".local"):
        raise ScrapeError("That URL is not a public job posting page.")

    try:
        resolved_ips = {info[4][0] for info in socket.getaddrinfo(hostname, None)}
    except socket.gaierror as exc:
        raise ScrapeError("Could not resolve that URL's host name.") from exc

    for ip in resolved_ips:
        addr = ipaddress.ip_address(ip)
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            raise ScrapeError("That URL is not a public job posting page.")


async def fetch_page_text(url: str) -> tuple[str, str]:
    """Load `url` in headless Chromium and return (page_text, title_hint).

    Raises ScrapeError on invalid URLs, navigation timeouts, or any other
    unrecoverable browser/navigation failure.
    """
    _validate_url(url)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            context = await browser.new_context(user_agent=_USER_AGENT)
            page = await context.new_page()
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=_NAV_TIMEOUT_MS)
            except PlaywrightTimeoutError as exc:
                raise ScrapeError(
                    "The page took too long to load. Try pasting the description instead."
                ) from exc
            except PlaywrightError as exc:
                logger.warning("Playwright navigation failed for %s: %s", url, exc)
                raise ScrapeError(
                    "Could not load that page. Try pasting the description instead."
                ) from exc

            # Many job boards (Workday, Cisco Careers, etc.) render the actual
            # posting body via JS well after domcontentloaded. Wait for the
            # network to settle so that content is present before extracting
            # text; if some background poller keeps the network busy forever,
            # fall back to whatever has rendered by the timeout rather than
            # failing the whole request.
            try:
                await page.wait_for_load_state("networkidle", timeout=_IDLE_TIMEOUT_MS)
            except PlaywrightTimeoutError:
                pass

            title_hint = await page.title()
            page_text = await page.inner_text("body")
            return page_text[:_MAX_PAGE_TEXT_CHARS], title_hint
        finally:
            await browser.close()
