import SwiftUI

@main
struct RistonchiStaffApp: App {
    @StateObject private var session = SessionModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if session.staff == nil {
                    LoginView(session: session)
                } else {
                    HomeView(session: session)
                }
            }
            .tint(Theme.terracotta)
            .background(Theme.plaster.ignoresSafeArea())
        }
    }
}

@MainActor
final class SessionModel: ObservableObject {
    @Published var baseURL: String
    @Published var token: String?
    @Published var staff: Staff?

    init() {
        baseURL = UserDefaults.standard.string(forKey: "ristonchi.baseURL") ?? "http://127.0.0.1:8787"
        token = KeychainToken.load()
        if token != nil {
            Task { await restore() }
        }
    }

    var client: APIClient { APIClient(baseURL: baseURL, token: token) }

    func signIn(email: String, password: String) async throws {
        struct Response: Decodable { var token: String; var staff: Staff }
        let response: Response = try await APIClient(baseURL: baseURL, token: nil).post(
            "/api/auth/login",
            body: ["email": email, "password": password]
        )
        UserDefaults.standard.set(baseURL, forKey: "ristonchi.baseURL")
        KeychainToken.save(response.token)
        token = response.token
        staff = response.staff
    }

    func restore() async {
        struct Response: Decodable { var staff: Staff }
        do {
            let response: Response = try await client.get("/api/me")
            staff = response.staff
        } catch {
            signOut()
        }
    }

    func signOut() {
        KeychainToken.clear()
        token = nil
        staff = nil
    }
}
