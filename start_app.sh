#!/bin/bash

# 印尼地图标注系统启动脚本
# 自动创建虚拟环境、安装依赖、启动应用并打开浏览器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log "=== 印尼地图标注系统启动 ==="
log "项目目录: $SCRIPT_DIR"

# 检查Node.js和npm
if ! command -v node &> /dev/null; then
    error "Node.js 未安装，请先安装 Node.js"
    error "下载地址: https://nodejs.org/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    error "npm 未安装，请先安装 npm"
    exit 1
fi

NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
info "Node.js 版本: $NODE_VERSION"
info "npm 版本: $NPM_VERSION"

# 检查并创建日志目录
LOG_DIR="$SCRIPT_DIR/logs"
if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR"
    log "创建日志目录: $LOG_DIR"
fi

# 日志文件
APP_LOG="$LOG_DIR/app-$(date +'%Y%m%d').log"
ERROR_LOG="$LOG_DIR/error-$(date +'%Y%m%d').log"

# 记录启动信息到日志文件
{
    echo "=== $(date +'%Y-%m-%d %H:%M:%S') 应用启动 ==="
    echo "Node.js 版本: $NODE_VERSION"
    echo "npm 版本: $NPM_VERSION"
    echo "项目目录: $SCRIPT_DIR"
} >> "$APP_LOG"

# 检查package.json
if [ ! -f "package.json" ]; then
    error "package.json 文件不存在"
    exit 1
fi

# 检查并安装依赖
log "检查项目依赖..."
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    log "安装项目依赖..."
    if npm install >> "$APP_LOG" 2>> "$ERROR_LOG"; then
        log "依赖安装成功"
    else
        error "依赖安装失败，请检查网络连接和npm配置"
        error "错误日志: $ERROR_LOG"
        exit 1
    fi
else
    log "依赖已存在，检查更新..."
    if npm ci >> "$APP_LOG" 2>> "$ERROR_LOG"; then
        log "依赖检查完成"
    else
        warn "依赖检查失败，尝试重新安装..."
        rm -rf node_modules package-lock.json
        if npm install >> "$APP_LOG" 2>> "$ERROR_LOG"; then
            log "依赖重新安装成功"
        else
            error "依赖安装失败"
            exit 1
        fi
    fi
fi

# 检查必要文件
log "检查必要文件..."
required_files=("public/markers.csv" "src/App.tsx" "src/App.css")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        error "必要文件不存在: $file"
        exit 1
    fi
done
log "所有必要文件检查完成"

# 检查端口是否被占用
PORT=3000
check_port() {
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

if check_port; then
    warn "端口 $PORT 已被占用，尝试终止占用进程..."
    PIDS=$(lsof -Pi :$PORT -sTCP:LISTEN -t)
    for pid in $PIDS; do
        kill -TERM $pid 2>/dev/null || true
        sleep 2
        if kill -0 $pid 2>/dev/null; then
            kill -KILL $pid 2>/dev/null || true
        fi
    done
    sleep 3
    
    if check_port; then
        error "无法释放端口 $PORT，请手动终止占用进程"
        exit 1
    else
        log "端口 $PORT 已释放"
    fi
fi

# 启动开发服务器
log "启动 React 开发服务器..."
log "服务器将在 http://localhost:$PORT 上运行"

# 延迟打开浏览器
open_browser() {
    sleep 8
    APP_URL="http://localhost:$PORT"
    
    # 检查服务器是否启动成功
    for i in {1..30}; do
        if curl -s "$APP_URL" > /dev/null 2>&1; then
            log "服务器启动成功，正在打开浏览器..."
            if command -v open &> /dev/null; then
                # macOS
                open "$APP_URL"
            elif command -v xdg-open &> /dev/null; then
                # Linux
                xdg-open "$APP_URL"
            elif command -v start &> /dev/null; then
                # Windows
                start "$APP_URL"
            else
                log "无法自动打开浏览器，请手动访问: $APP_URL"
            fi
            break
        fi
        sleep 1
    done
}

# 后台运行浏览器打开函数
open_browser &

# 启动 React 应用
info "正在启动应用，请稍候..."
info "如果浏览器没有自动打开，请手动访问: http://localhost:$PORT"
info "按 Ctrl+C 停止应用"

# 设置环境变量
export BROWSER=none
export PORT=$PORT

# 记录启动成功到日志
echo "$(date +'%Y-%m-%d %H:%M:%S') - 应用启动成功，端口: $PORT" >> "$APP_LOG"

# 启动应用并处理错误
if npm start 2>&1 | tee -a "$APP_LOG"; then
    log "应用正常关闭"
else
    error "应用启动或运行过程中出现错误"
    error "详细日志请查看: $APP_LOG"
    exit 1
fi

# 清理工作
cleanup() {
    log "正在关闭应用..."
    echo "$(date +'%Y-%m-%d %H:%M:%S') - 应用关闭" >> "$APP_LOG"
    exit 0
}

# 捕获终止信号
trap cleanup SIGINT SIGTERM

wait
