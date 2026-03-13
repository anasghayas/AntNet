# AntNet

AntNet is a decentralized AI grid and a Distributed Intelligence Swarm that distributes heavy text-processing tasks across a network of volunteer devices. It accepts large `.txt` files, splits them into manageable chunks, and processes user-defined requests in parallel using local **phi3** models. This design enables scalable, low-cost AI inference without relying on cloud GPUs or external APIs.

---

## Features

- 📄 **Text File Input**  
  Accepts `.txt` files as the primary data source.

- ✂️ **Configurable Chunking**  
  Supports text chunking with adjustable sizes ranging from **500 to 5000 characters**.

- 📝 **Task Request Interface**  
  Allows users to specify what actions or analysis should be performed on the text data via the **master web server**.

- 🌐 **Distributed Worker Execution**  
  User-defined requests are forwarded from the master server to one or more **worker applications** running on separate machines.

- ⚡ **Parallel Processing**  
  Workers process text chunks in parallel, reducing **processing time** and **LLM computation cost**, and publish results back to the master server.

- 🧠 **Master–Worker Architecture**  
  Implements a master–worker model where the master server coordinates tasks and worker nodes perform distributed computation.

- 💬 **Integrated Chat Interface**  
  The master web server provides a chat feature that compiles processed data and forwards it to a **swarm-based AI model** for final responses.

---

## MASTER–WEB SERVER

**Live Application:**  
https://ant-net-frontend-lsn2.vercel.app/

**You are required to install and setup the AntNet_Lite_Setup and run the worker or else it will show "Waiting for Connection".**

The master web server acts as the central control layer of the AntNet system and provides the primary user interface.

- Users upload their data in **`.txt` format** through the web interface.
- Users can configure:
  - **Chunk size range**
  - **Number of fragments** to distribute across workers
- Users submit a **custom request or instruction** describing how the uploaded text should be processed.
- The master server distributes the workload to **multiple worker machines** running the worker application.
- Worker nodes process the assigned text chunks in parallel and return results to the master server.
- The master server compiles the processed chunks and presents the final output to the user through the web interface or chat system.

---

## AntNet_Lite_Setup Installation Guide

## Setup Instructions

### **Step 1: Install and Run the Worker**
- Install the setup package and run it on your local machine.  
- It is **strongly recommended** to run the worker on a **separate machine** from the main server to avoid excessive CPU and RAM usage.

### **Step 2: Automatic Ollama & Model Setup**
- If **Ollama** is not already installed, the setup will automatically install it.  
- The **phi3:mini (3.8B parameters)** AI model will also be pulled automatically.

### **Step 3: Using an Existing Ollama Installation**
- If Ollama is already installed or running in environments such as:
  - Docker  
  - Docker Compose  
  - Kubernetes  
  - Virtual Machines  
- Ensure Ollama is **running before starting the worker setup**.  
- The worker will **not detect Ollama** if it is not active at startup.

### **Step 4: Parallel Processing (Recommended)**
- Run the worker on **multiple machines** for improved performance.  
- Enables **parallel processing** and faster overall data handling.

### **Step 5: Use GPU-Enabled Machines (Recommended)**
- For faster data processing and improved inference performance, it is recommended to run workers on **GPU-enabled machines**.  
- More powerful GPUs significantly reduce processing time, especially when handling large text datasets.
