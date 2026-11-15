import SwiftUI

struct LoginView: View {
    @ObservedObject var session: SessionModel
    @State private var email = ""
    @State private var password = ""
    @State private var error = ""
    @State private var busy = false
    @State private var demoPassword = ""
    @State private var accounts: [(email: String, note: String)] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                CypressMark()
                Text("CASTELLO DI RISTONCHI")
                    .font(.caption)
                    .tracking(2)
                    .foregroundStyle(Theme.inkSoft)
                Text(Brand.name.replacingOccurrences(of: " Staff", with: ""))
                    .font(Theme.serif)
                Text("For the people who host the day. Sign in with your Norberto account.")
                    .foregroundStyle(Theme.inkSoft)
                field("API", text: $session.baseURL)
                field("Email", text: $email)
                SecureField("Password", text: $password)
                    .padding(12)
                    .background(Theme.paper)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                if !error.isEmpty {
                    Text(error).foregroundStyle(Theme.wine)
                }
                Button(busy ? "Signing in" : "Sign in") {
                    Task { await submit() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || email.isEmpty || password.isEmpty)
                if !accounts.isEmpty {
                    Text("Sample desk. Password \(demoPassword).")
                        .font(.footnote)
                        .foregroundStyle(Theme.inkSoft)
                    ForEach(accounts, id: \.email) { account in
                        Button("\(account.email) · \(account.note)") {
                            email = account.email
                            password = demoPassword
                        }
                        .font(.footnote)
                    }
                }
            }
            .padding(24)
        }
        .background(Theme.plaster)
        .task { await loadDemo() }
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.caption).foregroundStyle(Theme.inkSoft)
            TextField(title, text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(12)
                .background(Theme.paper)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func submit() async {
        busy = true
        error = ""
        do {
            try await session.signIn(email: email, password: password)
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }

    private func loadDemo() async {
        struct Health: Decodable {
            struct Demo: Decodable {
                struct Account: Decodable { var email: String; var note: String }
                var password: String
                var accounts: [Account]
            }
            var demo: Demo?
        }
        let health: Health? = try? await APIClient(baseURL: session.baseURL, token: nil).get("/api/health")
        demoPassword = health?.demo?.password ?? ""
        accounts = health?.demo?.accounts.map { ($0.email, $0.note) } ?? []
    }
}
