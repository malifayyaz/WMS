# MongoDB Setup Guide for WMS

## Option 1: Local MongoDB (Recommended for Development)

### Step 1: Install MongoDB

**Windows:**
1. Download MongoDB Community Server from: https://www.mongodb.com/try/download/community
2. Run the installer and choose "Complete" installation
3. During installation, check "Install MongoDB as a Service" and "Run service as Network Service user"
4. MongoDB will start automatically after installation

**macOS:**
```bash
# Using Homebrew
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux (Ubuntu/Debian):**
```bash
# Import MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install MongoDB
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

### Step 2: Verify MongoDB is Running

**Windows:**
- Open Services (Win+R → `services.msc`)
- Look for "MongoDB" service and ensure it's "Running"

**macOS/Linux:**
```bash
# Check if MongoDB is running
mongosh --eval "db.version()"
# Or
mongo --eval "db.version()"
```

### Step 3: Use the MongoDB URI

Your `.env` file already has the correct local MongoDB URI:
```env
MONGODB_URI=mongodb://localhost:27017/wire-manufacturing
```

This means:
- `localhost:27017` - MongoDB running on your computer, default port
- `wire-manufacturing` - Database name (will be created automatically)

**That's it!** Your backend will connect to MongoDB when you run `npm run dev`.

---

## Option 2: MongoDB Atlas (Cloud - Free Tier Available)

MongoDB Atlas is a cloud-hosted MongoDB service. Free tier includes 512MB storage.

### Step 1: Create MongoDB Atlas Account

1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Sign up with email or Google/GitHub
3. Choose the **FREE** tier (M0 Sandbox)

### Step 2: Create a Cluster

1. After signup, click **"Build a Database"**
2. Choose **"M0 FREE"** tier
3. Select a cloud provider and region (choose closest to you)
4. Click **"Create"** (takes 3-5 minutes)

### Step 3: Create Database User

1. Go to **"Database Access"** (left sidebar)
2. Click **"Add New Database User"**
3. Choose **"Password"** authentication
4. Enter a username (e.g., `wmsadmin`)
5. Enter a strong password (save it!)
6. Set privileges to **"Atlas admin"** or **"Read and write to any database"**
7. Click **"Add User"**

### Step 4: Whitelist Your IP Address

1. Go to **"Network Access"** (left sidebar)
2. Click **"Add IP Address"**
3. For development, click **"Add Current IP Address"**
4. Or click **"Allow Access from Anywhere"** (0.0.0.0/0) - less secure but easier for testing
5. Click **"Confirm"**

### Step 5: Get Your Connection String

1. Go to **"Database"** (left sidebar)
2. Click **"Connect"** on your cluster
3. Choose **"Connect your application"**
4. Select **"Node.js"** and version **"5.5 or later"**
5. Copy the connection string (looks like):
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### Step 6: Update Your .env File

Replace `<username>` and `<password>` with your database user credentials, and add the database name:

**Example:**
```env
MONGODB_URI=mongodb+srv://wmsadmin:YourPassword123@cluster0.xxxxx.mongodb.net/wire-manufacturing?retryWrites=true&w=majority
```

**Important:** Replace:
- `wmsadmin` → your database username
- `YourPassword123` → your database password
- `cluster0.xxxxx` → your actual cluster address
- `wire-manufacturing` → database name (you can change this)

### Step 7: Test Connection

Run your backend:
```bash
cd WMS/backend
npm run dev
```

You should see: `MongoDB Connected: ...` in the console.

---

## Quick Comparison

| Feature | Local MongoDB | MongoDB Atlas |
|---------|--------------|---------------|
| **Setup Time** | 5-10 minutes | 10-15 minutes |
| **Internet Required** | No | Yes |
| **Free** | Yes | Yes (512MB free tier) |
| **Best For** | Development, offline work | Production, team collaboration |
| **Storage** | Limited by your disk | 512MB free, then paid |

---

## Troubleshooting

### Local MongoDB Not Starting

**Windows:**
- Check Services: `services.msc` → MongoDB should be "Running"
- Restart: Right-click MongoDB service → Restart

**macOS/Linux:**
```bash
# Check status
brew services list  # macOS
sudo systemctl status mongod  # Linux

# Start manually
mongod --dbpath /data/db  # Make sure /data/db exists
```

### Connection Refused Error

- Ensure MongoDB is running (see above)
- Check port 27017 is not blocked by firewall
- Verify `MONGODB_URI` in `.env` is correct

### Atlas Connection Issues

- Verify IP address is whitelisted in Network Access
- Check username/password in connection string
- Ensure cluster is fully created (not still provisioning)
- Try removing `?retryWrites=true&w=majority` from URI if it fails

---

## Your Current Setup

✅ **JWT_SECRET:** Generated and updated in `.env`  
✅ **MONGODB_URI:** Set to local MongoDB (`mongodb://localhost:27017/wire-manufacturing`)

**Next Steps:**
1. If using local MongoDB: Install MongoDB (see Option 1 above)
2. If using Atlas: Follow Option 2 steps
3. Run `node seed.js` to create initial users
4. Run `npm run dev` to start backend
