# Dev server: static files with no caching, so edits to js/ and css/ always show up on reload.
# Run from the project root: python3 tools/serve.py [port]
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 5173), NoCache).serve_forever()
