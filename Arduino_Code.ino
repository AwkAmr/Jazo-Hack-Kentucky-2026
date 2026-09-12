// ============================================================================
// Jazo Face Sync -- MatrixPortal S3 (ESP32-S3) + 128x64 HUB75 LED Matrix
// ============================================================================
// v4 changes:
//   - Eye shapes now match the REAL JazoFace.module.css design:
//       * angry / empathetic: mirrored diagonal "eyebrow" cuts
//       * happy: bottom edge curves upward (smile-shaped eyes)
//       * tired: top of eye chopped off (droopy eyelid)
//       * confused: left eye smaller, right eye bigger (not vertically offset)
//   - Eye color is a constant blue (adjustable below).
//   - Speaking pulse only stretches height (not width) and lifts eyes
//     upward slightly, matching the real CSS transform.
//   - Debug testing: type one of the six mood names into Serial Monitor to
//     preview it directly, without needing a live interview running. These
//     are the ONLY expressions -- typing one just previews that feeling;
//     it does not simulate speaking or blinking, only the six moods below:
//       default | happy | angry | tired | confused | empathetic
//     Type 'live' to hand control back to the web app (this is a mode
//     switch, not an expression).
// ============================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_Protomatter.h>

// ---------------------------------------------------------------------------
// EDIT THESE THREE LINES
// ---------------------------------------------------------------------------
const char* WIFI_SSID     = "Genuine Work";
const char* WIFI_PASSWORD = "G3nU1nEW0Rk";
const char* SERVER_URL    = "http://192.168.50.72:3000/api/face-state";

// ---------------------------------------------------------------------------
// HUB75 matrix pin configuration for the Adafruit MatrixPortal ESP32-S3
// ---------------------------------------------------------------------------
uint8_t rgbPins[]  = {42, 41, 40, 38, 39, 37};
uint8_t addrPins[] = {45, 36, 48, 35, 21};
uint8_t clockPin   = 2;
uint8_t latchPin   = 47;
uint8_t oePin      = 14;

#define MATRIX_WIDTH  128
#define MATRIX_HEIGHT 64

Adafruit_Protomatter matrix(
  MATRIX_WIDTH, 4, 1, rgbPins, sizeof(addrPins), addrPins,
  clockPin, latchPin, oePin, true);

// ---------------------------------------------------------------------------
// Eye geometry -- proportioned to roughly match JazoFace's 210x330 eyes with
// a 120px gap (tall, narrow eyes), scaled down to fit the 128x64 panel.
// ---------------------------------------------------------------------------
#define EYE_BASE_W 26
#define EYE_BASE_H 40
#define EYE_GAP    20

// Constant eye color (mood is shown via shape, not color -- matching the
// real web app, which always uses one color and changes shape per mood).
// Adjust these three numbers (R, G, B, each 0-255) to change the shade.
#define EYE_COLOR_R 0
#define EYE_COLOR_G 229
#define EYE_COLOR_B 255

// ---------------------------------------------------------------------------
// Face state -- updated from the web app via HTTP polling, UNLESS debugMode
// is active (see handleSerialDebug below), in which case it's whatever you
// last typed into Serial Monitor.
// ---------------------------------------------------------------------------
String mood = "default";
bool isSpeaking = false;
float speakVolume = 0;
bool debugMode = false;

unsigned long lastPollAt = 0;
const unsigned long POLL_INTERVAL_MS = 200;

bool isBlinking = false;
unsigned long nextBlinkAt = 0;
unsigned long blinkEndsAt = 0;

float gazeX = 0, gazeY = 0;
unsigned long nextGazeAt = 0;

void setup() {
  Serial.begin(115200);
  delay(3000); // let native USB reconnect after reset before printing

  Serial.println();
  Serial.println("=== JAZO Matrix Sync v3 booting ===");

  ProtomatterStatus status = matrix.begin();
  Serial.printf("Matrix begin() status: %d (0 = OK)\n", (int)status);
  if (status != PROTOMATTER_OK) {
    Serial.println("!!! Matrix failed to initialize -- check PSRAM setting and wiring !!!");
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 20000) {
    delay(400);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi FAILED to connect -- check SSID/password.");
  }

  randomSeed(analogRead(0));
  scheduleNextBlink();
  scheduleNextGaze();

  Serial.println("=== Setup complete ===");
  Serial.println("Type a mood to preview it: default happy angry tired confused empathetic");
  Serial.println("Type 'live' to return to normal syncing with the web app.");
}

void scheduleNextBlink() {
  nextBlinkAt = millis() + random(2000, 5000);
}

void scheduleNextGaze() {
  if (isSpeaking) {
    nextGazeAt = millis() + random(1000, 3000);
  } else {
    nextGazeAt = millis() + random(2000, 6000);
  }
}

void updateBlink() {
  unsigned long now = millis();
  if (isBlinking && now >= blinkEndsAt) {
    isBlinking = false;
  }
  if (!isBlinking && now >= nextBlinkAt) {
    isBlinking = true;
    blinkEndsAt = now + 150;
    scheduleNextBlink();
  }
}

void updateGaze() {
  unsigned long now = millis();
  if (now >= nextGazeAt) {
    if (isSpeaking) {
      gazeX = (random(-100, 100) / 100.0) * 3.0;
      gazeY = (random(-100, 100) / 100.0) * 1.5;
    } else {
      if (random(0, 100) < 30) {
        gazeX = 0; gazeY = 0;
      } else {
        gazeX = (random(-100, 100) / 100.0) * 16.0;
        gazeY = (random(-100, 100) / 100.0) * 8.0;
      }
    }
    scheduleNextGaze();
  }
}

// ---------------------------------------------------------------------------
// Debug command handling -- type a mood into Serial Monitor to preview it
// directly. These six words are the ONLY expressions the face has, matching
// JazoFace.tsx exactly. 'live' is a mode switch (back to normal web app
// syncing), not an expression.
// ---------------------------------------------------------------------------
void handleSerialDebug() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toLowerCase();
  if (cmd.length() == 0) return;

  if (cmd == "default" || cmd == "happy" || cmd == "angry" ||
      cmd == "tired" || cmd == "confused" || cmd == "empathetic") {
    mood = cmd;
    debugMode = true;
    Serial.println("[DEBUG] expression -> " + cmd);
  } else if (cmd == "live" || cmd == "auto") {
    debugMode = false;
    Serial.println("[DEBUG] back to live syncing from the web app");
  } else {
    Serial.println("Unknown command '" + cmd + "'. Try: default happy angry tired confused empathetic live");
  }
}

void pollFaceState() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(3000);
  int code = http.GET();

  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (!err) {
      mood        = doc["mood"] | "default";
      isSpeaking  = doc["isSpeaking"] | false;
      speakVolume = doc["speakVolume"] | 0.0;
    }
  } else if (code < 0) {
    Serial.printf("Poll failed (%d): %s\n", code, http.errorToString(code).c_str());
  }
  http.end();
}

// Draws one eye, shaped according to the current mood, gaze, blink, and
// speaking state -- matching JazoFace.module.css as closely as the matrix's
// resolution allows.
void drawEyeShape(int cx, int cy, bool isLeftEye) {
  float scale = 1.0;
  if (mood == "confused") {
    scale = isLeftEye ? 0.8 : 1.1; // real design: size difference, not offset
  }

  int w = (int)(EYE_BASE_W * scale);
  int h = (int)(EYE_BASE_H * scale);

  // Speaking pulse: Y-axis only (matches the CSS transform, which scales
  // only the vertical axis) + a slight upward lift.
  float speakScale = 1.0 + (0.10 * speakVolume);
  h = (int)(h * speakScale);
  int lift = (int)(4 * speakVolume);

  int yTop = cy - h / 2;

  // Tired: chop off the top ~40% (droopy eyelid)
  bool tired = (mood == "tired");
  if (tired) {
    int chop = (int)(h * 0.40);
    yTop += chop;
    h -= chop;
  }

  // Blink: squish whatever shape we have down to a thin sliver
  if (isBlinking) h = max(2, (int)(h * 0.10));

  int x = cx - w / 2;
  int y = yTop - lift;

  uint16_t color = matrix.color565(EYE_COLOR_R, EYE_COLOR_G, EYE_COLOR_B);

  matrix.fillRoundRect(x, y, w, h, min(w, h) / 3, color);

  // Mood-specific "eyebrow" cutouts (skipped while blinking or tired, since
  // those already reshape the whole eye)
  if (!isBlinking && !tired) {
    int wedgeH = (int)(h * 0.35);

    if (mood == "angry") {
      if (isLeftEye) {
        // cut the inner (right-side) top corner down
        matrix.fillTriangle(x + w / 2, y, x + w, y, x + w, y + wedgeH, 0);
      } else {
        // cut the inner (left-side) top corner down
        matrix.fillTriangle(x, y, x + w / 2, y, x, y + wedgeH, 0);
      }
    } else if (mood == "empathetic") {
      // mirror of angry
      if (isLeftEye) {
        matrix.fillTriangle(x, y, x + w / 2, y, x, y + wedgeH, 0);
      } else {
        matrix.fillTriangle(x + w / 2, y, x + w, y, x + w, y + wedgeH, 0);
      }
    } else if (mood == "happy") {
      int peak = (int)(h * 0.35);
      matrix.fillTriangle(x, y + h, x + w, y + h, x + w / 2, y + h - peak, 0);
    }
  }
}

void loop() {
  handleSerialDebug();

  unsigned long now = millis();
  if (!debugMode && now - lastPollAt > POLL_INTERVAL_MS) {
    pollFaceState();
    lastPollAt = now;
  }

  updateBlink();
  updateGaze();

  matrix.fillScreen(0);

  int leftX  = MATRIX_WIDTH / 2 - (EYE_BASE_W / 2 + EYE_GAP / 2) + (int)gazeX;
  int rightX = MATRIX_WIDTH / 2 + (EYE_BASE_W / 2 + EYE_GAP / 2) + (int)gazeX;
  int eyeY   = MATRIX_HEIGHT / 2 + (int)gazeY;

  drawEyeShape(leftX,  eyeY, true);
  drawEyeShape(rightX, eyeY, false);

  matrix.show();
  delay(16);
}
