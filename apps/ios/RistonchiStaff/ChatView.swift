import SwiftUI

struct ChatMessage: Identifiable {
    enum Kind { case user, assistant, tool, approval }
    var id = UUID().uuidString
    var kind: Kind
    var text: String = ""
    var tool: String = ""
    var result: String = ""
    var approvalId: String = ""
    var args: [String: JSONValue] = [:]
    var highConfirm = false
    var priorRead = true
    var status = "pending"
}

struct ChatView: View {
    @ObservedObject var session: SessionModel
    var agent: AgentInfo
    var conversationId: String?
    @State private var activeId: String?
    @State private var items: [ChatMessage] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var error = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if items.isEmpty {
                        Text(agent.blurb).foregroundStyle(Theme.inkSoft)
                        ForEach(agent.suggestions, id: \.self) { suggestion in
                            Button(suggestion) { Task { await send(suggestion) } }
                                .buttonStyle(.bordered)
                        }
                    }
                    ForEach(items) { item in
                        row(item)
                    }
                    if !error.isEmpty { Text(error).foregroundStyle(Theme.wine) }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(alignment: .bottom) {
                TextField("Ask about a couple, a date, or the day", text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                Button("Send") { Task { await send(draft) } }
                    .disabled(busy || draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(12)
            .background(Theme.paper)
        }
        .background(Theme.plaster)
        .navigationTitle(agent.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private func row(_ item: ChatMessage) -> some View {
        switch item.kind {
        case .user:
            Text(item.text)
                .padding(12)
                .foregroundStyle(Theme.paper)
                .background(Theme.olive)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .frame(maxWidth: .infinity, alignment: .trailing)
        case .assistant:
            Text(item.text)
                .padding(12)
                .background(Theme.paper)
                .clipShape(RoundedRectangle(cornerRadius: 16))
        case .tool:
            DisclosureGroup("Read from Norberto: \(item.tool.replacingOccurrences(of: "_", with: " "))") {
                Text(item.result).font(.footnote)
            }
        case .approval:
            VStack(alignment: .leading, spacing: 8) {
                Text(item.status == "pending" ? "NEEDS YOUR APPROVAL" : item.status.uppercased())
                    .font(.caption)
                    .foregroundStyle(Theme.wine)
                Text(item.tool.replacingOccurrences(of: "_", with: " ")).font(.headline)
                Text(item.highConfirm
                     ? "High-confirm. Norberto receives confirm only after you approve."
                     : "This changes Norberto. It does not run until you approve.")
                    .font(.subheadline)
                if !item.priorRead {
                    Text("No live read has happened yet in this conversation.")
                        .foregroundStyle(Theme.terracotta)
                }
                ForEach(item.args.keys.sorted(), id: \.self) { key in
                    Text("\(key): \(item.args[key]?.display ?? "")").font(.footnote)
                }
                if item.status == "pending" {
                    HStack {
                        Button("Approve") { Task { await decide(item, "approve") } }
                            .buttonStyle(.borderedProminent)
                        Button("Reject") { Task { await decide(item, "reject") } }
                    }
                    .disabled(busy)
                }
            }
            .padding(14)
            .background(Theme.paper)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.wine.opacity(0.4)))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private func load() async {
        activeId = conversationId
        guard let conversationId else { return }
        struct Body: Decodable { var items: [TranscriptItem] }
        guard let body = try? await session.client.get("/api/conversations/\(conversationId)") as Body else { return }
        items = body.items.map(fromTranscript)
    }

    private func send(_ text: String) async {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !busy else { return }
        draft = ""
        error = ""
        busy = true
        items.append(ChatMessage(kind: .user, text: message))
        var body: [String: Any] = ["agentId": agent.id, "message": message]
        if let activeId { body["conversationId"] = activeId }
        await consume(session.client.stream("/api/chat", body: body))
        busy = false
    }

    private func decide(_ item: ChatMessage, _ decision: String) async {
        busy = true
        if let index = items.firstIndex(where: { $0.id == item.id }) {
            items[index].status = decision == "approve" ? "executing" : "rejected"
        }
        await consume(session.client.stream("/api/approvals/\(item.approvalId)", body: ["decision": decision]))
        if decision == "approve", let index = items.firstIndex(where: { $0.id == item.id }) {
            items[index].status = "executed"
        }
        busy = false
    }

    private func consume(_ stream: AsyncThrowingStream<ChatEvent, Error>) async {
        do {
            for try await event in stream {
                apply(event)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func apply(_ event: ChatEvent) {
        switch event.type {
        case "meta":
            activeId = event.conversationId
        case "token", "notice":
            let piece = event.text ?? event.message ?? ""
            if let last = items.last, last.kind == .assistant {
                items[items.count - 1].text += piece
            } else {
                items.append(ChatMessage(kind: .assistant, text: piece))
            }
        case "tool_result":
            items.append(ChatMessage(kind: .tool, tool: event.tool ?? "", result: event.result?.display ?? ""))
        case "approval_required":
            items.append(ChatMessage(
                kind: .approval,
                tool: event.tool ?? "",
                approvalId: event.approvalId ?? "",
                args: event.args ?? [:],
                highConfirm: event.highConfirm ?? false,
                priorRead: event.priorRead ?? false
            ))
        case "error":
            error = event.message ?? "Something went wrong."
        default:
            break
        }
    }

    private func fromTranscript(_ item: TranscriptItem) -> ChatMessage {
        switch item.kind {
        case "user": return ChatMessage(id: item.id, kind: .user, text: item.text ?? "")
        case "assistant": return ChatMessage(id: item.id, kind: .assistant, text: item.text ?? "")
        case "tool": return ChatMessage(id: item.id, kind: .tool, tool: item.tool ?? "", result: item.result?.display ?? "")
        default:
            return ChatMessage(
                id: item.id,
                kind: .approval,
                tool: item.tool ?? "",
                approvalId: item.approvalId ?? "",
                args: item.args ?? [:],
                highConfirm: item.highConfirm ?? false,
                priorRead: item.priorRead ?? false,
                status: item.status ?? "pending"
            )
        }
    }
}
