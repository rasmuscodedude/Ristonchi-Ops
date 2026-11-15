import SwiftUI

enum Theme {
    static let plaster = Color(red: 0.953, green: 0.925, blue: 0.875)
    static let paper = Color(red: 0.984, green: 0.965, blue: 0.933)
    static let ink = Color(red: 0.165, green: 0.133, blue: 0.106)
    static let inkSoft = Color(red: 0.369, green: 0.325, blue: 0.282)
    static let terracotta = Color(red: 0.612, green: 0.251, blue: 0.188)
    static let olive = Color(red: 0.243, green: 0.290, blue: 0.204)
    static let wine = Color(red: 0.431, green: 0.180, blue: 0.227)
    static let serif = Font.custom("Georgia", size: 34)
}

struct CypressMark: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(red: 0.937, green: 0.894, blue: 0.824))
            CypressShape()
                .fill(Theme.olive)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
        }
        .frame(width: 56, height: 56)
    }
}

struct CypressShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let top = CGPoint(x: rect.midX, y: rect.minY)
        path.move(to: top)
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX * 0.78, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.midY)
        )
        path.addLine(to: CGPoint(x: rect.maxX * 0.22, y: rect.maxY))
        path.addQuadCurve(to: top, control: CGPoint(x: rect.minX, y: rect.midY))
        return path
    }
}
