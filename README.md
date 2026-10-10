# AWS VPC Simulator & Packet Flow Tracer

A feature-complete, interactive web application simulating the three core pillars of **AWS Virtual Private Cloud (VPC)** networking alongside an **Animated Hop-by-Hop Packet Tracer**. Built for Cloud Architecture Design coursework.

![AWS VPC Simulator](assets/styles.css)

---

## 🌟 Features Overview

### 1. Feature 1: VPC and Subnets with CIDR Planning
- **Single VPC Management:** Configure VPC name and IPv4 CIDR block (`/16` to `/28`).
- **Subnet Allocation:** Divide VPC CIDR into subnets across Availability Zones (`us-east-1a/b/c`).
- **CIDR Calculator Panel:** Displays network address, usable host range, total IPs, usable IPs (excluding AWS 5 reserved IPs), free IPs, and a visual address space allocation bar.

### 2. Feature 2: Route Tables & Internet Gateway (IGW)
- **Internet Gateway Lifecycle:** Create, attach, detach, and delete IGW.
- **Route Table Management:** Main route table and custom route tables with longest-prefix match routing (`0.0.0.0/0` -> IGW or local).
- **Public vs. Private Determination:** Subnets dynamically display live `PUBLIC` or `PRIVATE` badges based on explicit IGW route association.

### 3. Feature 3: Stateful Security Groups
- **Instance Firewall Rules:** Add inbound rules filtered by Protocol (TCP/UDP/ICMP/ALL), Port ranges (`80`, `22`, `3306`, etc.), and Source (CIDR or SG reference).
- **Stateful Firewall Behavior:** Fixed read-only outbound rules demonstrating that reply traffic is automatically permitted.
- **Delete Protection:** Prevents deleting security groups attached to instances or referenced by other rules.

### 4. Enhancement: Animated Hop-by-Hop Packet Flow Simulator
- **Explainer-Video Stage:** Full SVG canvas depicting VPC containers, public/private subnets, IGW, route table routers, SG shields, and EC2 servers.
- **Real-Time Connectivity Engine:** Powered by `traceConnectivity()` evaluating packet paths across instance-to-instance and instance-to-internet flows.
- **Hop-by-Hop Animation:** Animated glowing packet dot traveling along real network nodes with PASS/FAIL checkpoint reactions and plain-English narration captions.
- **"Fix It Live" Auto-Resolution:** Automatically applies necessary route or firewall rule fixes when a packet is blocked and replays the animation to show success.

---

## 🚀 Running Locally

This application is built with vanilla JavaScript (ES modules), HTML, and CSS. No build step or node package installation is required!

To serve locally using Python:

```bash
# Navigate to project root directory
cd Cloud

# Start Python 3 HTTP server
python -m http.server 8000
```

Open your browser and navigate to:
`http://localhost:8000`

---

## 🌐 Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In your repository on GitHub, navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, select **Deploy from a branch**.
4. Choose the `main` branch and `/ (root)` folder, then click **Save**.
5. Your site will be live at `https://<your-username>.github.io/<repository-name>/`.

---

## 📁 Repository Structure

```
.
├── index.html               # Main application entry HTML
├── assets/
│   └── styles.css           # Design system tokens, light/dark themes & UI layout
├── src/
│   ├── main.js              # Application entrypoint & Hash Router
│   ├── core/                # Core Logic Modules (NO DOM Access)
│   │   ├── cidr.js          # Unsigned 32-bit CIDR math & AWS reserved IP calculation
│   │   ├── store.js         # Reactive store & LocalStorage persistence
│   │   ├── ids.js           # AWS resource ID generator (vpc-xxx, sg-xxx)
│   │   ├── validators.js    # Validation & delete protection rules
│   │   ├── connectivity.js  # Connectivity tracer logic engine
│   │   └── sample.js        # Sample architecture state loader
│   └── ui/                  # UI View Components
│       ├── layout.js        # Topbar, collapsible sidebar & modal container
│       ├── toast.js         # Toast notification utility
│       ├── diagram.js       # Pure SVG architecture topology renderer & export
│       ├── overviewView.js  # Overview hero diagram & stats page
│       ├── vpcView.js       # VPC & Subnets CIDR calculator page
│       ├── routingView.js   # Route tables & IGW page
│       ├── sgView.js        # Security groups firewall page
│       ├── instancesView.js # EC2 instances launch page
│       └── simulationView.js # Animated packet flow tracer page
├── README.md                # Project documentation
└── EXPLAIN.md               # Student viva presentation walkthrough guide
```
