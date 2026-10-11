import AuthenticationServices
import UIKit
import WebKit
import Capacitor

class RelayViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private var oauthDelegate: OAuthNavigationDelegate?
    private var didAddOAuthHandler = false

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        installOAuthDelegate()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        installOAuthDelegate()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "relayOAuth",
              let body = message.body as? String,
              let url = URL(string: body),
              OAuthNavigationDelegate.isGoogleSignIn(url) else { return }
        oauthDelegate?.beginGoogleSignIn(url)
    }

    private func installOAuthDelegate() {
        guard let webView else { return }
        if !didAddOAuthHandler {
            webView.configuration.userContentController.add(self, name: "relayOAuth")
            didAddOAuthHandler = true
        }
        guard !(webView.navigationDelegate is OAuthNavigationDelegate) else { return }
        let wrapped = OAuthNavigationDelegate(
            forwarding: webView.navigationDelegate,
            uiForwarding: webView.uiDelegate
        )
        wrapped.attach(webView: webView, presenter: self)
        oauthDelegate = wrapped
        webView.navigationDelegate = wrapped
        webView.uiDelegate = wrapped
    }
}

final class OAuthNavigationDelegate: NSObject, WKNavigationDelegate, WKUIDelegate, ASWebAuthenticationPresentationContextProviding {
    weak var forward: (any WKNavigationDelegate)?
    weak var uiForward: (any WKUIDelegate)?
    private weak var webView: WKWebView?
    private weak var presenter: UIViewController?
    private var session: ASWebAuthenticationSession?

    init(forwarding: (any WKNavigationDelegate)?, uiForwarding: (any WKUIDelegate)?) {
        self.forward = forwarding
        self.uiForward = uiForwarding
    }

    func attach(webView: WKWebView, presenter: UIViewController) {
        self.webView = webView
        self.presenter = presenter
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = presenter?.view.window { return window }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let url = navigationAction.request.url, Self.isGoogleSignIn(url), navigationAction.targetFrame?.isMainFrame != false {
            decisionHandler(.cancel)
            DispatchQueue.main.async { [weak self] in
                self?.beginGoogleSignIn(url)
            }
            return
        }
        if let forward {
            forward.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url, Self.isGoogleSignIn(url) {
            beginGoogleSignIn(url)
            return nil
        }
        return uiForward?.webView?(webView, createWebViewWith: configuration, for: navigationAction, windowFeatures: windowFeatures)
    }

    func beginGoogleSignIn(_ url: URL) {
        session?.cancel()
        let next = ASWebAuthenticationSession(url: url, callbackURLScheme: "relay") { [weak self] callback, _ in
            guard let callback else { return }
            self?.returnToApp(callback)
        }
        next.presentationContextProvider = self
        next.prefersEphemeralWebBrowserSession = false
        session = next
        if !next.start() {
            UIApplication.shared.open(url)
        }
    }

    private func returnToApp(_ url: URL) {
        var target = "/sso-callback"
        if let query = url.query, !query.isEmpty {
            target += "?\(query)"
        }
        if let fragment = url.fragment, !fragment.isEmpty {
            target += "#\(fragment)"
        }
        guard let data = try? JSONEncoder().encode(target),
              let encoded = String(data: data, encoding: .utf8) else { return }
        let js = "window.location.replace(\(encoded))"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js)
        }
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector)
            || (forward?.responds(to: aSelector) ?? false)
            || (uiForward?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if super.responds(to: aSelector) { return nil }
        if let forward, forward.responds(to: aSelector) { return forward }
        if let uiForward, uiForward.responds(to: aSelector) { return uiForward }
        return nil
    }

    static func isGoogleSignIn(_ url: URL) -> Bool {
        url.scheme == "https" && url.host?.lowercased() == "accounts.google.com"
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = RelayViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
