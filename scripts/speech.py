"""Offline English recognition for the WebTask userscript."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

from vosk import KaldiRecognizer, Model

busy = Lock()


class SpeechHandler(BaseHTTPRequestHandler):
    def answer(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if (self.path != "/transcribe" or self.headers.get("Host") != "127.0.0.1:4180"
                or self.headers.get("X-WebTask-Audio") != "pcm16"
                or self.headers.get_content_type() != "application/octet-stream"):
            return self.answer(403, {})
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 32000 * 600 or length % 2:
            return self.answer(413, {})
        if not busy.acquire(blocking=False):
            return self.answer(409, {})
        try:
            self.connection.settimeout(30)
            recognizer = KaldiRecognizer(self.server.model, 16000)
            recognizer.SetWords(True)
            segments = []

            def append(result):
                words = json.loads(result).get("result", [])
                if words:
                    segments.append({"start": words[0]["start"], "text": " ".join(w["word"] for w in words)})

            while length:
                chunk = self.rfile.read(min(length, 8000))
                if not chunk:
                    return
                length -= len(chunk)
                if recognizer.AcceptWaveform(chunk):
                    append(recognizer.Result())
            append(recognizer.FinalResult())
            self.answer(200, segments)
        finally:
            busy.release()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model")
    server = ThreadingHTTPServer(("127.0.0.1", 4180), SpeechHandler)
    server.model = Model(parser.parse_args().model)
    server.serve_forever()
