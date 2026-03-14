// swift-tools-version: 5.10
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "CanvasFlowMac",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .executable(
            name: "CanvasFlowMac",
            targets: ["CanvasFlowMac"]
        ),
    ],
    dependencies: [
        .package(url: "https://github.com/migueldeicaza/SwiftTerm.git", from: "1.11.2"),
    ],
    targets: [
        .executableTarget(
            name: "CanvasFlowMac",
            dependencies: [
                .product(name: "SwiftTerm", package: "SwiftTerm"),
            ],
            path: "Sources/CanvasFlowMac"
        ),
    ]
)
