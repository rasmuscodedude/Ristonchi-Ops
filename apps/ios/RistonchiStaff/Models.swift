import Foundation

/// The product name lives in packages/shared/src/brand.ts. Keep this fallback in step with it.
enum Brand {
    static let name = "Ristonchi Staff"
}

struct Staff: Codable, Equatable {
    var id: String
    var email: String
    var name: String
    var role: String
    var flags: Flags
    struct Flags: Codable, Equatable {
        var sales: Bool?
    }
}

struct AgentInfo: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var blurb: String
    var suggestions: [String]
}

struct ConversationSummary: Codable, Identifiable {
    var id: String
    var agentId: String
    var title: String
    var updatedAt: String
}

struct AuditEntry: Codable, Identifiable {
    var id: String
    var at: String
    var staffName: String
    var staffEmail: String
    var agentId: String
    var tool: String
    var args: [String: JSONValue]
    var approved: Bool?
    var status: String
}

enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .null
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var display: String {
        switch self {
        case .string(let value): return value
        case .number(let value):
            return value.rounded() == value ? String(Int(value)) : String(value)
        case .bool(let value): return value ? "true" : "false"
        case .null: return ""
        case .object, .array:
            guard let data = try? JSONEncoder().encode(self),
                  let text = String(data: data, encoding: .utf8) else { return "" }
            return text
        }
    }
}

struct ChatEvent: Decodable {
    var type: String
    var conversationId: String?
    var text: String?
    var message: String?
    var callId: String?
    var tool: String?
    var result: JSONValue?
    var approvalId: String?
    var args: [String: JSONValue]?
    var highConfirm: Bool?
    var priorRead: Bool?
}

struct TranscriptItem: Decodable, Identifiable {
    var id: String
    var kind: String
    var text: String?
    var tool: String?
    var result: JSONValue?
    var approvalId: String?
    var args: [String: JSONValue]?
    var highConfirm: Bool?
    var priorRead: Bool?
    var status: String?
}
