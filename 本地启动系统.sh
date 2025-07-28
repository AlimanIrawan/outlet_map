#!/bin/bash

# 印尼雅加达冰柜配送地图系统 - 本地启动脚本
# 支持双击启动，自动在浏览器中打开

# 设置脚本目录
cd "$(dirname "$0")"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🗺️ 印尼雅加达冰柜配送地图系统${NC}"
echo "=================================="
echo ""

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未找到Node.js，请先安装Node.js${NC}"
    echo "下载地址: https://nodejs.org/"
    read -p "按回车键退出..."
    exit 1
fi

echo -e "${GREEN}✅ Node.js版本: $(node --version)${NC}"
echo -e "${GREEN}✅ npm版本: $(npm --version)${NC}"
echo ""

# 创建本地环境变量文件
if [ ! -f "feishu-sync-service/.env" ]; then
    echo -e "${YELLOW}📝 创建本地测试环境配置...${NC}"
    cat > feishu-sync-service/.env << 'EOF'
# 本地测试模式配置
FEISHU_APP_ID=demo_app_id
FEISHU_APP_SECRET=demo_app_secret
FEISHU_APP_TOKEN=demo_app_token
FEISHU_TABLE_ID=demo_table_id
GITHUB_TOKEN=demo_github_token
GITHUB_REPO_OWNER=demo-owner
GITHUB_REPO_NAME=demo-repo
NODE_ENV=development
PORT=5000
LOCAL_TEST_MODE=true
EOF
    echo -e "${GREEN}✅ 环境配置已创建${NC}"
fi

# 安装前端依赖
echo -e "${BLUE}📦 检查前端依赖...${NC}"
if [ ! -d "node_modules" ]; then
    echo "正在安装前端依赖..."
    npm install --silent
fi

# 安装后端依赖
echo -e "${BLUE}📦 检查后端依赖...${NC}"
cd feishu-sync-service
if [ ! -d "node_modules" ]; then
    echo "正在安装后端依赖..."
    npm install --silent
fi
cd ..

# 停止可能在运行的服务
echo -e "${YELLOW}🔄 清理端口...${NC}"
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
lsof -ti :5000 | xargs kill -9 2>/dev/null || true
sleep 2

# 启动后端服务
echo -e "${BLUE}🔧 启动后端服务...${NC}"
cd feishu-sync-service
npm start > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端服务
echo -e "${BLUE}🌐 启动前端服务...${NC}"
export BROWSER=none
npm start > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

# 等待前端启动并自动打开浏览器
echo -e "${YELLOW}⏳ 等待服务启动中...${NC}"
sleep 8

# 检查服务状态
if ps -p $FRONTEND_PID > /dev/null && ps -p $BACKEND_PID > /dev/null; then
    echo -e "${GREEN}🎉 系统启动成功！${NC}"
    echo ""
    echo "📍 前端地址: http://localhost:3000"
    echo "🔧 后端地址: http://localhost:5000"
    echo ""
    echo "👤 登录信息:"
    echo "   用户名: One Meter"
    echo "   密码: prioritaspelayanan"
    echo ""
    
    # 自动打开浏览器
    echo -e "${BLUE}🌐 正在打开浏览器...${NC}"
    open "http://localhost:3000"
    
    echo ""
    echo -e "${YELLOW}⏹️ 要停止系统，请关闭此窗口或按 Ctrl+C${NC}"
    
    # 等待用户关闭
    trap 'echo ""; echo "正在停止系统..."; kill $FRONTEND_PID 2>/dev/null; kill $BACKEND_PID 2>/dev/null; echo "系统已停止"; exit 0' INT
    
    while true; do
        sleep 1
        if ! ps -p $FRONTEND_PID > /dev/null || ! ps -p $BACKEND_PID > /dev/null; then
            echo "服务已停止"
            break
        fi
    done
else
    echo -e "${RED}❌ 系统启动失败${NC}"
    kill $FRONTEND_PID 2>/dev/null
    kill $BACKEND_PID 2>/dev/null
    read -p "按回车键退出..."
fi 