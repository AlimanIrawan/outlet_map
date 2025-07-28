#!/bin/bash

echo "🚀 Routes API可视化升级 - 云端部署状态检查"
echo "=================================================="
echo ""

# 配置
RENDER_URL="https://feishu-delivery-sync.onrender.com"
LOCAL_URL="http://localhost:3000"

echo "📡 检查云端服务状态..."

# 检查服务基本状态
echo "🔍 1. 服务健康检查..."
curl -s "$RENDER_URL/health" | jq . 2>/dev/null || curl -s "$RENDER_URL/health"
echo ""

# 检查配置状态
echo "🔍 2. API配置状态..."
curl -s "$RENDER_URL/api/config-status" | jq . 2>/dev/null || curl -s "$RENDER_URL/api/config-status"
echo ""

# 检查Routes API功能
echo "🔍 3. Routes API功能测试..."
curl -X POST -s "$RENDER_URL/api/test-routes-visual" \
     -H "Content-Type: application/json" \
     -d '[]' | jq . 2>/dev/null || curl -X POST -s "$RENDER_URL/api/test-routes-visual" -H "Content-Type: application/json" -d '[]'
echo ""

# 检查API使用统计
echo "🔍 4. API使用统计..."
curl -s "$RENDER_URL/api/route-stats" | jq . 2>/dev/null || curl -s "$RENDER_URL/api/route-stats"
echo ""

echo "✅ 部署状态检查完成！"
echo ""
echo "🌐 访问地址："
echo "   主服务: $RENDER_URL"
echo "   前端系统: https://indonesia-delivery-map-system.netlify.app"
echo ""
echo "🔧 如需测试Routes API可视化："
echo "   curl -X POST $RENDER_URL/api/test-routes-visual"
echo "" 