#!/bin/bash

echo "🚀 Routes API可视化功能配置脚本"
echo "=================================="
echo ""

# 检查是否已存在.env文件
if [ -f ".env" ]; then
    echo "⚠️  发现现有.env文件，将备份为.env.backup"
    cp .env .env.backup
fi

# 创建.env文件
cat > .env << 'EOF'
# Google Maps API配置 (必需 - 用于Routes API可视化功能)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# 飞书多维表格应用配置 (可选 - 如果需要飞书数据同步)
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FEISHU_APP_TOKEN=bascnxxxxxxxxxxxxxxxxx
FEISHU_TABLE_ID=tblxxxxxxxxxxxxxxxxx

# GitHub仓库配置 (可选 - 如果需要GitHub同步)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REPO_OWNER=your-username
GITHUB_REPO_NAME=your-repo-name

# 服务配置
NODE_ENV=development
PORT=3000
EOF

echo "✅ .env文件已创建！"
echo ""
echo "📝 请编辑 .env 文件，填入您的Google Maps API密钥："
echo "   GOOGLE_MAPS_API_KEY=您的实际API密钥"
echo ""
echo "🔧 API密钥要求："
echo "   ✓ 启用 Routes API"
echo "   ✓ 启用 Distance Matrix API (备用)"
echo "   ✓ 启用 Geocoding API"
echo "   ✓ 删除或设置正确的API限制"
echo ""
echo "🎯 配置完成后运行："
echo "   node server.js"
echo ""
echo "🌐 然后访问："
echo "   http://localhost:3000/api/config-status (检查配置)"
echo "   http://localhost:3000/health (健康检查)"
echo "" 