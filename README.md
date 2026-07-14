# BizCard Snap 📸
### AI-Powered Business Card Scanner & Excel Exporter

BizCard Snap is a premium, fully responsive single-page web application designed to scan business cards, extract their contact details locally using Tesseract.js (or enhanced with Google Gemini AI Studio), and export them directly into structured Excel spreadsheets with embedded photo references.

---

## ✨ Features
* **Dual Capture Modes**: Use your physical webcam with active scanning guides or upload high-resolution card photos.
* **Intelligent Data Parsing**:
  * *Local Regex Fallback*: Offline extraction of name, company, email, mobile phone, work phone, LinkedIn profiles, and addresses.
  * *Gemini AI Enhancer*: Optional API integration to parse cards with 99%+ accuracy using multimodal vision.
* **Mobile Optimized**: Automatically resamples and downscales large smartphone camera images (to 1000px) to prevent memory crashes on mobile browsers and fit within standard LocalStorage quotas.
* **Camera Selection**: Swap between rear/front cameras or virtual webcams dynamically.
* **Rich Exports**:
  * **Offline ZIP Package**: Compiles the spreadsheet plus a folder of snapshots with relative Excel hyperlinks.
  * **Cloud URL Spreadsheet**: Embeds direct public links to the card images using Imgbb API keys.

---

## 🛠️ Tech Stack
* **Frontend**: Vanilla HTML5, CSS3 (Obsidian Dark Theme), ES6+ JavaScript.
* **Libraries**:
  * Tesseract.js (Local OCR)
  * SheetJS / xlsx (Excel File Compiler)
  * JSZip (ZIP Package Archiver)
  * Lucide Icons (Aesthetic vector iconography)

---

## 🚀 How to Run Locally
1. Clone the repository.
2. Start any local static file server (e.g. `npx http-server -p 3000 -c-1`).
3. Open `http://localhost:3000` in your web browser.
