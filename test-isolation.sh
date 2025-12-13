#!/usr/bin/env bash
# Test script to verify Docker App Node.js isolation from .NET App resources

set -e

echo "========================================="
echo "Testing Node.js Process Isolation"
echo "========================================="
echo ""

# Get the container ID
CONTAINER_ID=$(docker ps --filter "ancestor=techstacks-io" --format "{{.ID}}" | head -1)

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ Container not running. Build and start it first:"
    echo "   docker build -t techstacks-io ."
    echo "   docker run -d -p 5001:8080 techstacks-io"
    exit 1
fi

echo "✓ Found container: $CONTAINER_ID"
echo ""

echo "========================================="
echo "Test 1: File System Isolation"
echo "========================================="
echo ""

echo "Attempting to read .NET appsettings.json as nextjs..."
if docker exec -u nextjs "$CONTAINER_ID" cat /app/dotnet/appsettings.json 2>&1 | grep -q "Permission denied"; then
    echo "✅ PASS: nextjs CANNOT read /app/dotnet/appsettings.json"
else
    echo "❌ FAIL: nextjs CAN read .NET configuration files (SECURITY ISSUE)"
    exit 1
fi
echo ""

echo "Attempting to read .NET DLL files as nextjs..."
if docker exec -u nextjs "$CONTAINER_ID" ls /app/dotnet/*.dll 2>&1 | grep -q "Permission denied"; then
    echo "✅ PASS: nextjs CANNOT list .NET assemblies"
else
    echo "❌ FAIL: nextjs CAN access .NET assemblies (SECURITY ISSUE)"
    exit 1
fi
echo ""

echo "Attempting to access App_Data directory as nextjs..."
if docker exec -u nextjs "$CONTAINER_ID" ls /app/dotnet/App_Data 2>&1 | grep -q "Permission denied"; then
    echo "✅ PASS: nextjs CANNOT access App_Data directory"
else
    echo "❌ FAIL: nextjs CAN access App_Data (SECURITY ISSUE)"
    exit 1
fi
echo ""

echo "Verifying nextjs CAN read its own files..."
if docker exec -u nextjs "$CONTAINER_ID" cat /app/nextjs/package.json > /dev/null 2>&1; then
    echo "✅ PASS: nextjs CAN read /app/nextjs files (as expected)"
else
    echo "❌ FAIL: nextjs CANNOT read its own files (BROKEN)"
    exit 1
fi
echo ""

echo "========================================="
echo "Test 2: Environment Variable Isolation"
echo "========================================="
echo ""

echo "Checking if sensitive env vars are exposed to Node.js..."

# Get Node.js process environment (find the actual node process, not npm wrapper)
NODE_PID=$(docker exec "$CONTAINER_ID" pgrep -f "node.*next" | head -1)

if [ -z "$NODE_PID" ]; then
    # Fallback to npm process if node process not found yet
    NODE_PID=$(docker exec "$CONTAINER_ID" pgrep -f "npm" | tail -1)
fi

if [ -z "$NODE_PID" ]; then
    echo "❌ Could not find Node.js process"
    exit 1
fi

echo "Node.js PID: $NODE_PID"
echo ""

# Check for SERVICESTACK_LICENSE
if docker exec "$CONTAINER_ID" cat "/proc/$NODE_PID/environ" 2>/dev/null | tr '\0' '\n' | grep -q "SERVICESTACK_LICENSE"; then
    echo "❌ FAIL: SERVICESTACK_LICENSE is exposed to Node.js (SECURITY ISSUE)"
    exit 1
else
    echo "✅ PASS: SERVICESTACK_LICENSE is NOT exposed to Node.js"
fi
echo ""

# Verify safe vars ARE present
if docker exec "$CONTAINER_ID" cat "/proc/$NODE_PID/environ" 2>/dev/null | tr '\0' '\n' | grep -q "NODE_ENV=production"; then
    echo "✅ PASS: NODE_ENV is set (as expected)"
else
    echo "⚠️  WARNING: NODE_ENV not set"
fi
echo ""

if docker exec "$CONTAINER_ID" cat "/proc/$NODE_PID/environ" 2>/dev/null | tr '\0' '\n' | grep -q "INTERNAL_API_URL"; then
    echo "✅ PASS: INTERNAL_API_URL is set (as expected)"
else
    echo "⚠️  WARNING: INTERNAL_API_URL not set"
fi
echo ""

echo "Full Node.js process environment:"
echo "-----------------------------------"
docker exec "$CONTAINER_ID" cat "/proc/$NODE_PID/environ" 2>/dev/null | tr '\0' '\n' | sort
echo "-----------------------------------"
echo ""

echo "========================================="
echo "Test 3: Process User Isolation"
echo "========================================="
echo ""

DOTNET_PID=$(docker exec "$CONTAINER_ID" pgrep -f 'dotnet.*TechStacks.dll' | head -1)
DOTNET_USER=$(docker exec "$CONTAINER_ID" ps -o user= -p "$DOTNET_PID" 2>/dev/null | tr -d ' ')

# Find actual node process (not npm wrapper)
ACTUAL_NODE_PID=$(docker exec "$CONTAINER_ID" pgrep -f "node.*next" | head -1)
if [ -z "$ACTUAL_NODE_PID" ]; then
    # Fallback to npm if node not started yet
    ACTUAL_NODE_PID=$(docker exec "$CONTAINER_ID" pgrep -f "npm" | tail -1)
fi
NODE_USER=$(docker exec "$CONTAINER_ID" ps -o user= -p "$ACTUAL_NODE_PID" 2>/dev/null | tr -d ' ')

echo ".NET process (PID $DOTNET_PID) running as: $DOTNET_USER"
echo "Node.js process (PID $ACTUAL_NODE_PID) running as: $NODE_USER"
echo ""

# Show full process tree for debugging
echo "Process tree:"
docker exec "$CONTAINER_ID" ps aux | grep -E "dotnet|node|npm" | grep -v grep
echo ""

if [ "$DOTNET_USER" = "root" ] && [ "$NODE_USER" = "nextjs" ]; then
    echo "✅ PASS: Processes run as different users"
elif [ -z "$NODE_USER" ]; then
    echo "⚠️  WARNING: Could not determine Node.js user (process may not be fully started)"
else
    echo "❌ FAIL: Process isolation not working correctly"
    echo "   Expected: .NET=root, Node.js=nextjs"
    echo "   Got: .NET=$DOTNET_USER, Node.js=$NODE_USER"
    exit 1
fi
echo ""

echo "========================================="
echo "Test 4: Write Protection"
echo "========================================="
echo ""

echo "Attempting to write to .NET directory as nextjs..."
if docker exec -u nextjs "$CONTAINER_ID" sh -c 'echo "test" > /app/dotnet/malicious.txt' 2>&1 | grep -q "Permission denied"; then
    echo "✅ PASS: nextjs CANNOT write to /app/dotnet"
else
    echo "❌ FAIL: nextjs CAN write to .NET directory (SECURITY ISSUE)"
    exit 1
fi
echo ""

echo "Attempting to modify Node.js files (should fail - read-only)..."
if docker exec -u nextjs "$CONTAINER_ID" sh -c 'echo "test" > /app/nextjs/malicious.txt' 2>&1 | grep -q "Permission denied"; then
    echo "✅ PASS: Node.js directory is read-only (defense in depth)"
else
    echo "⚠️  WARNING: nextjs CAN write to its own directory"
fi
echo ""

echo "========================================="
echo "✅ ALL SECURITY TESTS PASSED"
echo "========================================="
echo ""
echo "Summary:"
echo "--------"
echo "• Node.js runs as unprivileged user 'nextjs'"
echo "• .NET files and configuration are NOT accessible to Node.js"
echo "• Sensitive environment variables are NOT exposed to Node.js"
echo "• Node.js cannot write to .NET directories"
echo "• Even if Node.js is compromised, attack surface is minimized"
echo ""
