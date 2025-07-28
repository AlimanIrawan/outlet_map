#!/bin/bash

# 印尼雅加达送货路线优化系统 - 启动脚本
# ==========================================

# 颜色输出函数
print_success() {
    echo -e "\033[32m✅ $1\033[0m"
}

print_error() {
    echo -e "\033[31m❌ $1\033[0m"
}

print_info() {
    echo -e "\033[34mℹ️  $1\033[0m"
}

print_warning() {
    echo -e "\033[33m⚠️  $1\033[0m"
}

# 脚本开始
clear
echo "🚀 印尼雅加达送货路线优化系统"
echo "================================"
echo ""

# 检查Node.js环境
print_info "检查Node.js环境..."
if ! command -v node &> /dev/null; then
    print_error "未检测到Node.js环境"
    print_info "请先安装Node.js: https://nodejs.org/"
    print_info "推荐版本: Node.js 18.x 或更高版本"
    exit 1
fi

# 显示Node.js版本
node_version=$(node --version)
npm_version=$(npm --version)
print_success "Node.js 版本: $node_version"
print_success "npm 版本: $npm_version"
echo ""

# 检查是否有package.json
if [ ! -f "package.json" ]; then
    print_error "未找到package.json文件"
    print_error "请确认在正确的项目目录中运行此脚本"
    exit 1
fi

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    print_info "首次运行，正在安装项目依赖..."
    npm install
    
    if [ $? -eq 0 ]; then
        print_success "依赖安装完成"
    else
        print_error "依赖安装失败"
        print_info "请尝试手动运行: npm install"
        exit 1
    fi
else
    print_success "项目依赖已安装"
fi

# 检查后端服务依赖
if [ -d "feishu-sync-service" ]; then
    print_info "检查后端服务依赖..."
    cd feishu-sync-service
    
    if [ ! -d "node_modules" ]; then
        print_info "安装后端服务依赖..."
        npm install
        
        if [ $? -eq 0 ]; then
            print_success "后端依赖安装完成"
        else
            print_warning "后端依赖安装失败，后端功能可能不可用"
        fi
    else
        print_success "后端依赖已安装"
    fi
    
    cd ..
fi

echo ""
print_info "准备启动系统..."

# 检查端口占用
PORT=3000
if lsof -i :$PORT &> /dev/null; then
    print_warning "端口 $PORT 已被占用"
    print_info "正在尝试终止占用进程..."
    
    # 询问是否终止占用进程
    read -p "是否终止占用端口 $PORT 的进程？(y/N): " kill_process
    if [[ $kill_process =~ ^[Yy]$ ]]; then
        lsof -ti :$PORT | xargs kill -9 2>/dev/null
        sleep 2
        print_success "端口已释放"
    else
        print_info "系统将尝试使用其他端口"
    fi
fi

# 设置环境变量
export NODE_ENV=development
export BROWSER=none  # 防止自动打开多个浏览器窗口

# 启动前端开发服务器
print_success "🌐 启动前端开发服务器..."
print_info "前端地址: http://localhost:3000"

# 在后台启动前端服务
npm start &
FRONTEND_PID=$!

# 等待前端服务启动
print_info "等待前端服务启动..."
sleep 3

# 检查前端是否成功启动
if ps -p $FRONTEND_PID > /dev/null; then
    print_success "前端服务启动成功 (PID: $FRONTEND_PID)"
else
    print_error "前端服务启动失败"
    exit 1
fi

# 启动后端服务（如果存在且已配置）
if [ -d "feishu-sync-service" ] && [ -f "feishu-sync-service/.env" ]; then
    print_info "检测到后端服务配置，启动后端服务..."
    
    cd feishu-sync-service
    npm start &
    BACKEND_PID=$!
    cd ..
    
    sleep 2
    if ps -p $BACKEND_PID > /dev/null; then
        print_success "后端服务启动成功 (PID: $BACKEND_PID)"
        print_info "后端地址: http://localhost:5000"
    else
        print_warning "后端服务启动失败，仅前端模式运行"
    fi
else
    print_warning "后端服务未配置或缺少环境变量文件"
    print_info "系统将以前端模式运行，部分功能可能不可用"
fi

# 等待服务完全启动
print_info "正在等待服务完全启动..."
sleep 5

# 检查服务是否可访问
frontend_check=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")
if [ "$frontend_check" = "200" ]; then
    print_success "前端服务运行正常"
else
    print_warning "前端服务可能还在启动中..."
fi

# 显示系统信息
echo ""
echo "🎉 印尼雅加达送货路线优化系统启动完成！"
echo "========================================="
echo ""
print_info "系统访问地址:"
echo "   🌐 前端界面: http://localhost:3000"
if [ ! -z "$BACKEND_PID" ] && ps -p $BACKEND_PID > /dev/null; then
    echo "   🔧 后端API: http://localhost:5000"
fi
echo ""
print_info "系统功能:"
echo "   📊 订单状态管理"
echo "   🧮 智能路线优化"
echo "   🗺️ 可视化地图界面"
echo "   🔄 实时数据同步"
echo ""
print_info "登录信息:"
echo "   👤 用户名: One Meter"
echo "   🔑 密码: prioritaspelayanan"
echo ""

# 自动打开浏览器
if command -v open &> /dev/null; then
    print_info "正在打开系统界面..."
    sleep 2
    open "http://localhost:3000"
    print_success "系统界面已在默认浏览器中打开"
elif command -v xdg-open &> /dev/null; then
    print_info "正在打开系统界面..."
    sleep 2
    xdg-open "http://localhost:3000"
    print_success "系统界面已在默认浏览器中打开"
else
    print_info "请手动访问: http://localhost:3000"
fi

echo ""
print_warning "系统控制信息:"
echo "   ⏹️  停止系统: 按 Ctrl+C"
echo "   📝 查看日志: 当前终端窗口"
echo "   🔄 重启系统: 重新运行此脚本"
echo ""

# 创建停止脚本
cat > stop_system.sh << 'EOF'
#!/bin/bash
echo "🛑 正在停止印尼雅加达送货路线优化系统..."

# 终止Node.js进程
pkill -f "node.*start"
pkill -f "react-scripts start"
pkill -f "npm start"

# 终止可能的端口占用
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :5000 | xargs kill -9 2>/dev/null

echo "✅ 系统已停止"
EOF

chmod +x stop_system.sh

# 保持脚本运行，显示日志
print_info "系统正在运行中，按 Ctrl+C 停止..."
echo ""

# 捕获中断信号
trap 'echo ""; print_info "正在停止系统..."; kill $FRONTEND_PID 2>/dev/null; [ ! -z "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null; print_success "系统已停止"; exit 0' INT

# 等待进程
wait $FRONTEND_PID 