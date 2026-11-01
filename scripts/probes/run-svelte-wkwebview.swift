import Cocoa
import WebKit

// Native system WebKit UI probe. This is not a packaged Tauri acceptance test.
final class MigrationProbe: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    let base: URL
    let source: String
    let output: URL
    var view: WKWebView!
    var window: NSWindow!
    var index = 0
    var results: [[String: Any]] = []
    let scenarios = ["light", "dark"].flatMap { theme in [375, 768, 1024, 1440].map { (theme, $0) } }
    init(base: URL, source: String, output: URL) { self.base = base; self.source = source; self.output = output }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "migration")
        let initial = "window.__migrationProbeErrors=[];window.addEventListener('error',e=>window.__migrationProbeErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__migrationProbeErrors.push(String(e.reason)));localStorage.setItem('multi-converter.theme',new URLSearchParams(location.search).get('probeTheme')||'light');"
        configuration.userContentController.addUserScript(WKUserScript(source: initial, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: configuration)
        view.navigationDelegate = self
        view.autoresizingMask = [.width, .height]
        window = NSWindow(contentRect: view.frame, styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "Multi-Converter Svelte system WebKit probe"
        window.contentView = view
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 110) { self.finish(fatal: "probe timeout") }
        next()
    }
    func next() {
        guard index < scenarios.count else { finish(); return }
        let (theme, width) = scenarios[index]
        window.setContentSize(NSSize(width: width, height: 900))
        let url = URL(string: "/?mockWelcomeSeen=1&mockMediaFiles=1&probeTheme=\(theme)&probeWidth=\(width)", relativeTo: base)!.absoluteURL
        view.load(URLRequest(url: url))
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(fatal: String(describing: error)) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView.url?.host == base.host else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            self.window.makeFirstResponder(self.view)
            for type in [NSEvent.EventType.keyDown, .keyUp] {
                if let event = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: self.window.windowNumber, context: nil, characters: "\t", charactersIgnoringModifiers: "\t", isARepeat: false, keyCode: 48) { NSApp.sendEvent(event) }
            }
            let (theme, width) = self.scenarios[self.index]
            let reduced = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? "true" : "false"
            let script = self.source + "\nrunMigrationProbe('\(theme)',\(width),\(reduced)).then(value=>window.webkit.messageHandlers.migration.postMessage(JSON.stringify(value)));void 0"
            self.view.evaluateJavaScript(script) { _, error in
                if let error = error { self.finish(fatal: String(describing: error)) }
            }
        }
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String, let data = text.data(using: .utf8), let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { finish(fatal: "invalid result"); return }
        results.append(result)
        let (theme, width) = scenarios[index]
        view.takeSnapshot(with: nil) { image, _ in
            if let image = image, let data = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data), let png = bitmap.representation(using: .png, properties: [:]) { try? png.write(to: self.output.appendingPathComponent("wkwebview-\(theme)-\(width).png")) }
            self.index += 1
            self.next()
        }
    }
    func finish(fatal: String? = nil) {
        var report: [String: Any] = ["runtime": "macOS system WKWebView compiled product mock preview; not Tauri IPC or DMG acceptance", "os": ProcessInfo.processInfo.operatingSystemVersionString, "scenarios": results, "passed": results.filter { $0["passed"] as? Bool == true }.count]
        if let fatal = fatal { report["fatal"] = fatal }
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: output.appendingPathComponent("report.json")) }
        print("WKWEBVIEW_PROBE: \(results.filter { $0["passed"] as? Bool == true }.count)/8 scenarios passed")
        let success = fatal == nil && results.count == 8 && results.allSatisfy { $0["passed"] as? Bool == true }
        fflush(stdout)
        exit(success ? 0 : 1)
    }
}
let args = CommandLine.arguments
let output = URL(fileURLWithPath: args[3], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let delegate = MigrationProbe(base: URL(string: args[1])!, source: try String(contentsOfFile: args[2], encoding: .utf8), output: output)
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
application.delegate = delegate
application.run()
