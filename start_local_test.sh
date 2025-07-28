#!/bin/bash

# 印尼雅加达送货地图展示系统 - 本地测试启动脚本
# =====================================================

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
echo "🗺️ 印尼雅加达送货地图展示系统"
echo "=============================="
echo "版本: 3.0.0 (简化版)"
echo ""

# 检查Node.js环境
print_info "检查Node.js环境..."
if ! command -v node &> /dev/null; then
    print_error "未检测到Node.js环境"
    print_info "请先安装Node.js: https://nodejs.org/"
    print_info "推荐版本: Node.js 18.x 或更高版本"
    exit 1
fi

# 显示版本信息
node_version=$(node --version)
npm_version=$(npm --version)
print_success "Node.js 版本: $node_version"
print_success "npm 版本: $npm_version"
echo ""

# 检查项目结构
if [ ! -f "package.json" ]; then
    print_error "未找到前端package.json文件"
    exit 1
fi

if [ ! -f "feishu-sync-service/package.json" ]; then
    print_error "未找到后端package.json文件"
    exit 1
fi

# 安装前端依赖
print_info "检查前端依赖..."
if [ ! -d "node_modules" ]; then
    print_info "安装前端依赖..."
    npm install
    if [ $? -eq 0 ]; then
        print_success "前端依赖安装完成"
    else
        print_error "前端依赖安装失败"
        exit 1
    fi
else
    print_success "前端依赖已安装"
fi

# 安装后端依赖
print_info "检查后端依赖..."
cd feishu-sync-service
if [ ! -d "node_modules" ]; then
    print_info "安装后端依赖..."
    npm install
    if [ $? -eq 0 ]; then
        print_success "后端依赖安装完成"
    else
        print_error "后端依赖安装失败"
        exit 1
    fi
else
    print_success "后端依赖已安装"
fi
cd ..

# 检查环境变量文件
if [ ! -f "feishu-sync-service/.env" ]; then
    print_warning "未找到环境变量文件 (.env)"
    print_info "将创建示例环境变量文件..."
    
    if [ -f "feishu-sync-service/.env.example" ]; then
        cp feishu-sync-service/.env.example feishu-sync-service/.env
        print_success "已创建环境变量文件"
        print_warning "请编辑 feishu-sync-service/.env 文件，填入正确的配置"
        print_info "按回车键继续（将以模拟模式运行）..."
        read
    else
        print_error "缺少环境变量示例文件"
        exit 1
    fi
else
    print_success "环境变量文件已存在"
fi

# 检查端口占用
FRONTEND_PORT=3000
BACKEND_PORT=5000

if lsof -i :$FRONTEND_PORT &> /dev/null; then
    print_warning "端口 $FRONTEND_PORT 已被占用"
    lsof -ti :$FRONTEND_PORT | xargs kill -9 2>/dev/null
    sleep 1
    print_success "端口已释放"
fi

if lsof -i :$BACKEND_PORT &> /dev/null; then
    print_warning "端口 $BACKEND_PORT 已被占用"
    lsof -ti :$BACKEND_PORT | xargs kill -9 2>/dev/null
    sleep 1
    print_success "端口已释放"
fi

echo ""
print_info "准备启动系统..."

# 设置环境变量
export NODE_ENV=development
export BROWSER=none

# 创建示例数据文件
if [ ! -f "public/markers.csv" ]; then
    print_info "创建示例数据文件..."
    mkdir -p public
    cat > public/markers.csv << 'EOF'
shop_code,latitude,longitude,outlet_name,phoneNumber,kantong,orderType,totalDUS,finalPrice
TEST001,-6.121566354,106.919700019,"Ibu Sri Utami","081234567890","A","reguler","17","85000"
TEST002,-6.124966993,106.951539851,"Ibu Murniati","082345678901","B","reguler","4","20000"
TEST003,-6.108881024,106.937086433,"Bapak Supriadi","083456789012","A","express","5","25000"
TEST004,-6.115234567,106.925678901,"Ibu Siti","084567890123","C","reguler","8","40000"
TEST005,-6.118765432,106.942345678,"Bapak Ahmad","085678901234","B","express","12","60000"
EOF
    print_success "示例数据文件已创建"
fi

# 启动后端服务
print_info "🔧 启动后端服务..."
cd feishu-sync-service
npm start &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3
if ps -p $BACKEND_PID > /dev/null; then
    print_success "后端服务启动成功 (PID: $BACKEND_PID)"
    print_info "后端地址: http://localhost:$BACKEND_PORT"
else
    print_warning "后端服务启动失败，但前端仍可运行"
fi

# 启动前端服务
print_info "🌐 启动前端服务..."
npm start &
FRONTEND_PID=$!

# 等待前端启动
sleep 5
if ps -p $FRONTEND_PID > /dev/null; then
    print_success "前端服务启动成功 (PID: $FRONTEND_PID)"
    print_info "前端地址: http://localhost:$FRONTEND_PORT"
else
    print_error "前端服务启动失败"
    exit 1
fi

# 显示系统信息
echo ""
echo "🎉 系统启动完成！"
echo "================"
echo ""
print_info "访问地址:"
echo "   🌐 前端界面: http://localhost:$FRONTEND_PORT"
if [ ! -z "$BACKEND_PID" ] && ps -p $BACKEND_PID > /dev/null; then
    echo "   🔧 后端API: http://localhost:$BACKEND_PORT"
    echo "   📊 健康检查: http://localhost:$BACKEND_PORT/health"
fi
echo ""
print_info "系统功能:"
echo "   📍 地图标记展示"
echo "   🔄 数据同步"
echo "   📊 统计信息"
echo "   🗺️ 交互式地图"
echo ""
print_info "登录信息:"
echo "   👤 用户名: One Meter"
echo "   🔑 密码: prioritaspelayanan"
echo ""
print_info "测试数据:"
echo "   📍 包含5个示例订单位置"
echo "   🏪 覆盖雅加达不同区域"
echo ""

# 自动打开浏览器 (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    print_info "正在打开系统界面..."
    sleep 2
    open "http://localhost:$FRONTEND_PORT"
    print_success "系统界面已在默认浏览器中打开"
fi

echo ""
print_warning "控制说明:"
echo "   ⏹️  停止系统: 按 Ctrl+C"
echo "   📝 查看日志: 当前终端窗口"
echo ""

# 捕获中断信号
trap 'echo ""; print_info "正在停止系统..."; kill $FRONTEND_PID 2>/dev/null; [ ! -z "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null; print_success "系统已停止"; exit 0' INT

# 等待进程
print_info "系统正在运行中，按 Ctrl+C 停止..."
echo ""
wait $FRONTEND_PID 