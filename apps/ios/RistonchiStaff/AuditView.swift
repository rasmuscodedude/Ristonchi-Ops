import SwiftUI

struct AuditView: View {
    @ObservedObject var session: SessionModel
    @State private var entries: [AuditEntry] = []
    @State private var error = ""

    var body: some View {
        List(entries) { entry in
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.tool.replacingOccurrences(of: "_", with: " "))
                Text("\(entry.staffName) · \(entry.status)")
                    .font(.subheadline)
                    .foregroundStyle(entry.approved == true ? Theme.olive : Theme.wine)
                Text(entry.args.map { "\($0.key): \($0.value.display)" }.sorted().joined(separator: ", "))
                    .font(.footnote)
                    .foregroundStyle(Theme.inkSoft)
            }
            .padding(.vertical, 4)
        }
        .navigationTitle("Audit")
        .overlay {
            if !error.isEmpty { Text(error).foregroundStyle(Theme.wine) }
        }
        .task { await load() }
    }

    private func load() async {
        struct Body: Decodable { var entries: [AuditEntry] }
        do {
            let body: Body = try await session.client.get("/api/audit")
            entries = body.entries
        } catch {
            self.error = error.localizedDescription
        }
    }
}
