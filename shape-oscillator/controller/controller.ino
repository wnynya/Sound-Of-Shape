void setup() {
  Serial.begin(9600);
}

int mode = 1;

void loop() {
  int a0 = analogRead(A0);
  int a1 = analogRead(A1);
  int a2 = analogRead(A2);
  int a3 = analogRead(A3);
  int a4 = analogRead(A4);
  int a5 = analogRead(A5);
  int a6 = analogRead(A6);
  int a7 = analogRead(A7);

  analogWrite(A10, 255);
  if (analogRead(A11) >= 1023) {
    mode = 1;
  }
  else {
    mode = 0;
  }

  if (mode == 1) {
    analogWrite(A8, 0);
    analogWrite(A9, 255);
  }
  else {
    analogWrite(A8, 255);
    analogWrite(A9, 0);
  }

  Serial.println(String(mode) + "," + String(a3) + "," + String(a2) + "," + String(a1) + "," + String(a0) + "," + String(a7) + "," + String(a6) + "," + String(a5) + "," + String(a4) + ";");

  delay(20);
}