# Student Viva Presentation Walkthrough & Code Explanation

**Project:** AWS VPC Simulator & Packet Flow Tracer  
**Course:** Cloud Architecture & Networking Design  

---

## 📚 1. Feature-by-Feature Executive Summary

### Feature 1: VPC and Subnets with CIDR Planning
- **What it does:** Allows the creation of a single Virtual Private Cloud (VPC) with a master IPv4 CIDR block (e.g., `10.0.0.0/16`). Within this VPC, users can create subnets in specific Availability Zones (`us-east-1a`, `us-east-1b`).
- **Real File:** [`src/core/cidr.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/cidr.js) & [`src/ui/vpcView.js`](file:///c:/Users/bishn/Desktop/Cloud/src/ui/vpcView.js)
- **AWS Rule Simulation:** AWS reserves 5 IP addresses in every subnet (.0 Network, .1 Router, .2 DNS, .3 Reserved for future, and .255 Broadcast). The calculator explicitly deducts these 5 addresses to show true usable host capacity.

### Feature 2: Route Tables & Internet Gateway (IGW)
- **What it does:** Simulates how traffic is routed out of a subnet and determines whether a subnet is **Public** or **Private**.
- **Real File:** [`src/core/store.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/store.js#L110) (`isSubnetPublic()`) & [`src/ui/routingView.js`](file:///c:/Users/bishn/Desktop/Cloud/src/ui/routingView.js)
- **AWS Rule Simulation:** A subnet is **PUBLIC** if and only if its route table contains a default route (`0.0.0.0/0`) targeting an **attached Internet Gateway (IGW)**. Otherwise, it is **PRIVATE**.

### Feature 3: Stateful Security Groups
- **What it does:** Implements instance-level firewalls with allow-only inbound rules filtered by Protocol (TCP/UDP/ICMP), Port, and Source (CIDR block or Security Group reference).
- **Real File:** [`src/core/connectivity.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/connectivity.js#L95) & [`src/ui/sgView.js`](file:///c:/Users/bishn/Desktop/Cloud/src/ui/sgView.js)
- **AWS Rule Simulation:** Security Groups are **stateful**. If inbound traffic is allowed, the response (reply) traffic is automatically allowed outbound, regardless of outbound rules.

### ⭐ Enhancement: Animated Hop-by-Hop Packet Tracer
- **What it does:** Animates a packet travelling from a source EC2 through SG shields, subnet routers, and the IGW to a destination EC2 or the Internet.
- **Real File:** [`src/core/connectivity.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/connectivity.js) (`traceConnectivity()`) & [`src/ui/simulationView.js`](file:///c:/Users/bishn/Desktop/Cloud/src/ui/simulationView.js)
- **Key Capability:** Driven by `traceConnectivity()`. If a packet is BLOCKED (e.g. missing 3306 rule), clicking **Fix It Live** mutates the store state and replays the packet to show success.

---

## 🧮 2. Deep Dive: CIDR Bitwise Math Engine

All IPv4 calculations are executed using unsigned 32-bit bitwise integer math (`>>> 0`) in [`src/core/cidr.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/cidr.js):

1. **IP String to 32-Bit Integer (`ipToInt`):**
   ```javascript
   // Converts "10.0.1.4" -> 167772420 unsigned int
   intVal = (b0 << 24 | b1 << 16 | b2 << 8 | b3) >>> 0;
   ```
2. **Network Address Host-Bits Zero Validation (`parseCidr`):**
   - Masks the IP integer with prefix bitmask: `maskInt = (0xFFFFFFFF << (32 - prefix)) >>> 0`.
   - Computes `networkInt = (ipInt & maskInt) >>> 0`.
   - If `ipInt !== networkInt`, the user entered a host IP instead of a network address (e.g., `10.0.0.5/16` is rejected as invalid!).
3. **AWS 5 Reserved IPs Allocation:**
   - Total IPs = $2^{(32 - \text{prefix})}$.
   - Usable IPs = $\text{Total IPs} - 5$.
   - First usable IP assigned to EC2 instance = $\text{Network Int} + 4$ (i.e. `.4`).

---

## 🛰️ 3. How the Connectivity Tracer Engine Works

The function `traceConnectivity(state, input)` in [`src/core/connectivity.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/connectivity.js) evaluates network hops in order:

```
[Source EC2] ──> [Source SG Outbound] ──> [Route Table Lookup] ──> [IGW / Local Router] ──> [Dest SG Inbound] ──> [Dest EC2]
```

At each hop, the engine verifies rules:
- **Route Table Lookup:** Performs longest prefix match. If targeting Internet, checks if `0.0.0.0/0 -> igw` exists AND IGW is attached AND instance has a Public IP.
- **Inbound SG Rule Check:** Checks if destination SG has an inbound rule matching `protocol`, `port`, AND `source` (matching either source CIDR or source instance's SG ID).

---

## 🚫 4. Scope Boundaries: What is NOT Simulated & Why

To maintain strict alignment with the college project assignment requirements, the following AWS features were intentionally omitted:
- **NAT Gateways:** Omitted to focus purely on direct IGW public vs. private subnet routing.
- **Network ACLs (NACLs):** Omitted to focus on stateful Security Groups at the instance level rather than stateless subnet-level firewalls.
- **VPC Peering & Transit Gateways:** Omitted because scope is restricted to a single VPC topology.
- **VPC Endpoints & IPv6:** Omitted to keep IPv4 CIDR math clean and focused.

---

## 🎯 5. Top 10 Viva Questions & Answers

### Q1: How does your code determine if a subnet is Public or Private?
**Answer:** In [`src/core/store.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/store.js#L110), the `isSubnetPublic(subnetId)` function checks if the subnet's route table contains a route `0.0.0.0/0` with target `igw`, AND verifies that `state.igw.attached === true`.

### Q2: Why does an EC2 instance in a public subnet start at `.4` instead of `.1`?
**Answer:** AWS reserves the first 4 IP addresses (.0 Network, .1 VPC Router, .2 AWS DNS, .3 Reserved for future) and the last address (.255 Broadcast). In [`src/core/cidr.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/cidr.js#L68), `rawFirstUsableInt` is calculated as `networkInt + 4`.

### Q3: Why is `10.0.0.5/16` rejected as an invalid VPC CIDR block?
**Answer:** A CIDR network block requires all host bits to be zero. In [`src/core/cidr.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/cidr.js#L54), `parseCidr()` compares the parsed IP integer with the calculated network integer. Because `10.0.0.5` has non-zero host bits, it is rejected.

### Q4: How are Security Groups stateful in your tracer?
**Answer:** In [`src/core/connectivity.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/connectivity.js#L64), outbound traffic from a source SG is automatically allowed without requiring outbound rules, and return packets in `instance_to_instance` flows are permitted once the inbound check passes.

### Q5: What happens if an IGW is detached while an instance in a public subnet tries to reach the Internet?
**Answer:** The tracer in [`src/core/connectivity.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/connectivity.js#L76) fails at the IGW check hop with `result: 'FAIL'`, stating that the Internet Gateway is detached.

### Q6: Can a user delete a subnet that has running EC2 instances?
**Answer:** No. [`src/core/validators.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/validators.js#L44) implements `canDeleteSubnet()`, which checks if `state.instances` contains instances in that subnet and blocks deletion with an informative error message.

### Q7: How does Security Group source referencing work (e.g. allowing `web-sg` inside `db-sg`)?
**Answer:** In [`src/core/connectivity.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/connectivity.js#L128), when `rule.source` starts with `sg-`, the tracer checks if the source EC2 instance's `securityGroupId` matches `rule.source`.

### Q8: How is state persisted across browser refreshes?
**Answer:** [`src/core/store.js`](file:///c:/Users/bishn/Desktop/Cloud/src/core/store.js#L20) uses `localStorage.setItem('aws_vpc_sim_state_v1', JSON.stringify(state))` wrapped in a `try/catch` block to handle browser storage safely.

### Q9: How does the "Fix It Live" button work during packet simulation?
**Answer:** When `traceConnectivity()` returns `allowed: false`, it supplies a `fixHint` object. In [`src/ui/simulationView.js`](file:///c:/Users/bishn/Desktop/Cloud/src/ui/simulationView.js#L370), clicking the button executes the store mutation (e.g. adding the missing 3306 rule) and auto-replays the animation.

### Q10: Why are JavaScript 32-bit bitwise operators formatted with `>>> 0`?
**Answer:** In JavaScript, bitwise operators operate on signed 32-bit integers. Using the unsigned right shift operator `>>> 0` forces JavaScript to treat the result as an **unsigned 32-bit integer**, preventing negative numbers for IP addresses above `128.0.0.0`.
