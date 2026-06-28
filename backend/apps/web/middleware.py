class NoStoreWebMiddleware:
    """Mark authenticated web responses as non-cacheable, so logged-in content
    is not shown from the browser cache after sign-out."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/v1/web/"):
            response["Cache-Control"] = "no-store"
        return response
