import Foundation
import Security

enum KeychainToken {
    private static let account = "ristonchi.staff.token"

    static func save(_ token: String) {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum APIError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        if case .message(let text) = self { return text }
        return "Request failed."
    }
}

struct APIClient {
    var baseURL: String
    var token: String?

    func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(path, method: "GET", body: nil)
    }

    func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        try await send(path, method: "POST", body: body)
    }

    func stream(_ path: String, body: [String: Any]) -> AsyncThrowingStream<ChatEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try make(path, method: "POST")
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else {
                        throw APIError.message("No response.")
                    }
                    if http.statusCode >= 400 {
                        var text = ""
                        for try await line in bytes.lines { text += line }
                        throw APIError.message(errorText(text) ?? "Request failed.")
                    }
                    var dataLines: [String] = []
                    for try await line in bytes.lines {
                        if line.isEmpty {
                            try emit(dataLines, continuation)
                            dataLines = []
                        } else if line.hasPrefix("data:") {
                            dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
                        }
                    }
                    try emit(dataLines, continuation)
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func emit(_ lines: [String], _ continuation: AsyncThrowingStream<ChatEvent, Error>.Continuation) throws {
        let payload = lines.joined(separator: "\n")
        guard !payload.isEmpty, let data = payload.data(using: .utf8) else { return }
        continuation.yield(try JSONDecoder().decode(ChatEvent.self, from: data))
    }

    private func send<T: Decodable>(_ path: String, method: String, body: [String: Any]?) async throws -> T {
        var request = try make(path, method: method)
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.message("No response.") }
        if http.statusCode >= 400 {
            throw APIError.message(errorText(String(data: data, encoding: .utf8) ?? "") ?? "Request failed.")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func make(_ path: String, method: String) throws -> URLRequest {
        let trimmed = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: trimmed + path) else { throw APIError.message("The API address is not valid.") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
        return request
    }

    private func errorText(_ raw: String) -> String? {
        guard let data = raw.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let error = object["error"] as? String else { return nil }
        return error
    }
}
