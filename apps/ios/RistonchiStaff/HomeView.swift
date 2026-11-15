import SwiftUI

struct HomeView: View {
    @ObservedObject var session: SessionModel
    @State private var agents: [AgentInfo] = []
    @State private var conversations: [ConversationSummary] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text((session.staff?.role ?? "").replacingOccurrences(of: "_", with: " ").uppercased())
                        .font(.caption)
                        .tracking(2)
                        .foregroundStyle(Theme.inkSoft)
                    Text("Good day, \(session.staff?.name ?? "").")
                        .font(Theme.serif)
                    if agents.isEmpty {
                        Text("Your role does not have an assistant yet.")
                            .foregroundStyle(Theme.inkSoft)
                    }
                    ForEach(agents) { agent in
                        NavigationLink {
                            ChatView(session: session, agent: agent, conversationId: nil)
                        } label: {
                            card(title: agent.title, body: agent.blurb)
                        }
                        .buttonStyle(.plain)
                    }
                    if !conversations.isEmpty {
                        Text("Recent").font(.title2)
                        ForEach(conversations) { conversation in
                            NavigationLink {
                                ChatView(
                                    session: session,
                                    agent: AgentInfo(
                                        id: conversation.agentId,
                                        title: conversation.agentId == "sales-couples" ? "Sales / Couples" : "Wedding-day coordinator",
                                        blurb: "",
                                        suggestions: []
                                    ),
                                    conversationId: conversation.id
                                )
                            } label: {
                                card(title: conversation.title, body: conversation.agentId)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Theme.plaster)
            .navigationTitle(Brand.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if session.staff?.role == "admin" {
                    NavigationLink("Audit") { AuditView(session: session) }
                }
                Button("Sign out") { session.signOut() }
            }
            .task { await reload() }
        }
    }

    private func card(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.title3)
            Text(body).foregroundStyle(Theme.inkSoft).font(.subheadline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Theme.paper)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private func reload() async {
        struct AgentsBody: Decodable { var agents: [AgentInfo] }
        struct ConversationsBody: Decodable { var conversations: [ConversationSummary] }
        agents = (try? await session.client.get("/api/agents") as AgentsBody)?.agents ?? []
        conversations = (try? await session.client.get("/api/conversations") as ConversationsBody)?.conversations ?? []
    }
}
