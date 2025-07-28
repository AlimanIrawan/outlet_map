import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import L from 'leaflet';

// 修复leaflet图标问题
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// 创建总部自定义图标
const headquartersIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="60" height="60">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.4)"/>
        </filter>
      </defs>
      <polygon points="30,5 38,22 57,22 43,34 50,52 30,40 10,52 17,34 3,22 22,22" 
               fill="#FF8C00" 
               stroke="#FFFFFF" 
               stroke-width="3" 
               filter="url(#shadow)"/>
      <polygon points="30,10 36,24 50,24 39,33 44,48 30,37 16,48 21,33 10,24 24,24" 
               fill="#FFD700" 
               stroke="#FFFFFF" 
               stroke-width="2"/>
    </svg>
  `),
  iconSize: [60, 60],
  iconAnchor: [30, 30],
  popupAnchor: [0, -30],
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  shadowSize: [60, 60],
  shadowAnchor: [20, 30]
});



// 预定义图标
// 图标创建函数已移至getMarkerIcon函数内部

interface MarkerData {
  tanggalJoin: string;
  outletCode: string;
  type: string;
  tokoType: string;
  outletStatus: string;
  namaPemilik: string;
  event: string;
  contractSign: string;
  tanggalTurunFreezer: string;
  tanggalFirstPOEsKrim: string;
  dusPerDay: string;
  totalValueIDR: string;
  totalDUS: string;
  poBerapaKali: string;
  poFrequency: string;
  freezerCode: string;
  spanduk: string;
  flagHanger: string;
  poster: string;
  papanHarga: string;
  stikerHarga: string;
  lastService: string;
  lastBungaEs: string;
  latitude: number;
  longitude: number;
}

interface LoginFormProps {
  onLogin: () => void;
}

// 总部坐标（固定不变）
const HEADQUARTERS_POSITION: [number, number] = [-6.11258762834466, 106.91732818555802];

// 地图图层配置
const MAP_LAYERS = {
  street: {
    name: '标准地图',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  satellite: {
    name: '卫星视图',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
  }
};

type MapLayerType = keyof typeof MAP_LAYERS;

// 总部标记组件
const HeadquartersMarker: React.FC = () => {
  return (
    <Marker 
      position={HEADQUARTERS_POSITION} 
      icon={headquartersIcon}
      zIndexOffset={1000}
    >
      <Popup>
        <div className="popup-content headquarters-popup">
          <h3>🏢 公司总部</h3>
          <p><strong>地址:</strong> 印度尼西亚雅加达</p>
          <p><strong>坐标:</strong> {HEADQUARTERS_POSITION[0].toFixed(6)}, {HEADQUARTERS_POSITION[1].toFixed(6)}</p>
          <p><strong>类型:</strong> 总部办公室</p>
        </div>
      </Popup>
    </Marker>
  );
};

// 图层切换组件
const LayerControl: React.FC<{
  currentLayer: MapLayerType;
  onLayerChange: (layer: MapLayerType) => void;
}> = ({ currentLayer, onLayerChange }) => {
  return (
    <div className="layer-control">
      <button
        className={`layer-button ${currentLayer === 'street' ? 'active' : ''}`}
        onClick={() => onLayerChange('street')}
        title="标准地图"
      >
        🗺️
      </button>
      <button
        className={`layer-button ${currentLayer === 'satellite' ? 'active' : ''}`}
        onClick={() => onLayerChange('satellite')}
        title="卫星视图"
      >
        🛰️
      </button>
    </div>
  );
};

// 用户定位组件
const LocationMarker: React.FC = () => {
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const map = useMap();

  const startLocating = () => {
    setIsLocating(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError('您的浏览器不支持地理定位');
      setIsLocating(false);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserPosition([latitude, longitude]);
        map.flyTo([latitude, longitude], map.getZoom());
        setIsLocating(false);
      },
      (error) => {
        console.error('定位错误:', error);
        let errorMessage = '无法获取位置';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = '请允许访问位置信息';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = '位置信息不可用';
            break;
          case error.TIMEOUT:
            errorMessage = '获取位置超时';
            break;
        }
        setLocationError(errorMessage);
        setIsLocating(false);
      },
      options
    );
  };

  useEffect(() => {
    return () => {
      if (userPosition) {
        setUserPosition(null);
      }
    };
  }, [userPosition]);

  return (
    <>
      <button 
        onClick={startLocating}
        className={`control-button location-button ${isLocating ? 'locating' : ''}`}
        disabled={isLocating}
        title={isLocating ? '正在定位...' : '获取我的位置'}
      >
        📍
      </button>
      {locationError && <div className="location-error">{locationError}</div>}

      {userPosition && (
        <CircleMarker
          center={userPosition}
          radius={10}
          pathOptions={{
            fillColor: '#3388ff',
            fillOpacity: 0.7,
            color: '#fff',
            weight: 3,
            opacity: 1
          }}
        >
          <Popup>
            <div>
              <h3>您的当前位置</h3>
              <p>纬度: {userPosition[0].toFixed(6)}</p>
              <p>经度: {userPosition[1].toFixed(6)}</p>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </>
  );
};

// 登录凭据
const LOGIN_CREDENTIALS = {
  username: 'One Meter',
  password: 'prioritaspelayanan'
};

// 登录组件
const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800));

    if (username === LOGIN_CREDENTIALS.username && password === LOGIN_CREDENTIALS.password) {
      localStorage.setItem('isLoggedIn', 'true');
      onLogin();
    } else {
      setError('用户名或密码错误');
    }
    setIsLoading(false);
  };

  return (
    <div className="login-overlay">
      <div className="login-container">
        <div className="login-header">
          <h2>🗺️ 店铺标注地图</h2>
          <p>请登录以访问地图系统</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">用户名:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">密码:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              disabled={isLoading}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button 
            type="submit" 
            className={`login-btn ${isLoading ? 'loading' : ''}`}
            disabled={isLoading}
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>
        <div className="login-footer">
          <p>🏪 店铺标注地图系统</p>
        </div>
      </div>
    </div>
  );
};

// 获取标记图标（根据新的分类逻辑）
const getMarkerIcon = (marker: MarkerData) => {
  const tanggalTurunFreezer = marker.tanggalTurunFreezer;
  const tanggalFirstPOEsKrim = marker.tanggalFirstPOEsKrim;
  const hasEvent = marker.event === '✅';
  const dusPerDay = marker.dusPerDay || '0';
  const spandukStatus = marker.spanduk || '';
  
  let color = '#808080'; // 默认灰色
  
  // 根据新的颜色逻辑分配颜色
  if (tanggalTurunFreezer && tanggalTurunFreezer.trim() !== '' && 
      tanggalFirstPOEsKrim && tanggalFirstPOEsKrim.trim() !== '') {
    color = '#28a745'; // 绿色 - 两个日期都有
  } else if ((!tanggalTurunFreezer || tanggalTurunFreezer.trim() === '') && 
             (!tanggalFirstPOEsKrim || tanggalFirstPOEsKrim.trim() === '')) {
    color = '#808080'; // 灰色 - 两个日期都没有
  } else if (tanggalTurunFreezer && tanggalTurunFreezer.trim() !== '' && 
             (!tanggalFirstPOEsKrim || tanggalFirstPOEsKrim.trim() === '')) {
    color = '#dc3545'; // 红色 - 只有Tanggal Turun Freezer
  } else if ((!tanggalTurunFreezer || tanggalTurunFreezer.trim() === '') && 
             tanggalFirstPOEsKrim && tanggalFirstPOEsKrim.trim() !== '') {
    color = '#28a745'; // 绿色 - 只有Tanggal First PO EsKrim
  }
  
  // 创建自定义图标，中心显示DUS per Day（支持小数点）
  const borderStyle = hasEvent ? '3px solid #FFD700' : '2px solid white';
  // 格式化DUS per Day数值，支持小数点显示

  const formatDusPerDay = (value: string) => {
    const num = parseFloat(value || '0');
    if (isNaN(num)) return '0';
    // 如果是整数，直接显示；如果有小数，显示1位小数
    return num % 1 === 0 ? num.toString() : num.toFixed(1);
  };
  const formattedDus = formatDusPerDay(dusPerDay);
  
  // 检查是否需要显示横线（Spanduk状态不是"Udah Pasang"时）
  const needsUnderline = spandukStatus !== 'Udah Pasang';
  
  const iconHtml = `<div style="
      width: 24px;
      height: 24px;
      background-color: ${color};
      border: ${borderStyle};
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
      font-size: 9px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
      position: relative;
    ">
      <span style="line-height: 1;">${formattedDus}</span>
      ${needsUnderline ? '<div style="width: 12px; height: 1px; background-color: white; margin-top: 1px;"></div>' : ''}
    </div>`;
  
  return L.divIcon({
    html: iconHtml,
    className: 'custom-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

function App() {
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentLayer, setCurrentLayer] = useState<MapLayerType>('street');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Stik' | 'Ember'>('all');
  
  // 手动更新相关状态
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [lastManualUpdate, setLastManualUpdate] = useState(0);

  // 根据类型筛选标记
  const filteredMarkers = markers.filter(marker => {
    if (typeFilter === 'all') return true;
    return marker.type === typeFilter;
  });

  // 类型筛选切换函数
  const handleTypeFilterChange = () => {
    if (typeFilter === 'all') {
      setTypeFilter('Stik');
    } else if (typeFilter === 'Stik') {
      setTypeFilter('Ember');
    } else {
      setTypeFilter('all');
    }
  };

  // 加载CSV数据
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 暂时使用本地CSV文件，等GitHub API配置完成后再切换
      const response = await fetch(`${process.env.PUBLIC_URL || ''}/markers.csv`);
      
      if (!response.ok) {
        throw new Error(`加载数据失败: ${response.status} - 请检查数据文件`);
      }
      
      const csvText = await response.text();
      console.log('📄 CSV原始数据:', csvText.substring(0, 200) + '...');
      const processedMarkers = parseCSV(csvText);
      console.log('📍 解析后的标记数量:', processedMarkers.length);
      setMarkers(processedMarkers);
    } catch (error) {
      console.error('加载数据失败:', error);
      setError('加载数据失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }, []);

  // 手动刷新数据
  const handleManualUpdate = async () => {
    const now = Date.now();
    const cooldownTime = 60000; // 1分钟冷却时间

    // 检查冷却时间
    if (now - lastManualUpdate < cooldownTime) {
      const remainingTime = Math.ceil((cooldownTime - (now - lastManualUpdate)) / 1000);
      setUpdateMessage(`请等待 ${remainingTime} 秒后再次刷新`);
      setTimeout(() => setUpdateMessage(null), 3000);
      return;
    }

    setIsUpdating(true);
    setUpdateMessage(null);

    try {
      // 1. 调用后端API触发飞书数据同步
      console.log('🔄 开始手动同步飞书数据...');
      const apiUrl = process.env.REACT_APP_API_URL || 'https://outlet-map.onrender.com';
      const syncResponse = await fetch(`${apiUrl}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!syncResponse.ok) {
        throw new Error(`同步API调用失败: ${syncResponse.status}`);
      }

      // 2. 等待GitHub更新（给一些时间让文件更新）
      console.log('⏳ 等待数据同步完成...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. 重新加载CSV数据
      console.log('📥 重新加载地图数据...');
      await loadData();

      // 4. 更新状态
      setLastManualUpdate(now);
      setUpdateMessage('✅ 数据更新成功！');
      setTimeout(() => setUpdateMessage(null), 5000);

    } catch (error) {
      console.error('手动更新失败:', error);
      setUpdateMessage('❌ 更新失败，请稍后重试');
      setTimeout(() => setUpdateMessage(null), 5000);
    } finally {
      setIsUpdating(false);
    }
  };

  // 页面加载时获取数据
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 检查登录状态
  useEffect(() => {
    const loginStatus = localStorage.getItem('isLoggedIn');
    setIsLoggedIn(loginStatus === 'true');
  }, []);

  // 登录处理
  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  // 登出处理
  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    setIsLoggedIn(false);
  };

  // 如果未登录，显示登录界面
  if (!isLoggedIn) {
    return <LoginForm onLogin={handleLogin} />;
  }

  // 切换地图图层
  const handleLayerChange = (layer: MapLayerType) => {
    setCurrentLayer(layer);
  };

  const currentLayerConfig = MAP_LAYERS[currentLayer];

  // 统计数据（基于新的分类逻辑）
  const totalCount = filteredMarkers.length;
  const grayCount = filteredMarkers.filter(m => 
    (!m.tanggalTurunFreezer || m.tanggalTurunFreezer.trim() === '') && 
    (!m.tanggalFirstPOEsKrim || m.tanggalFirstPOEsKrim.trim() === '')
  ).length;
  const redCount = filteredMarkers.filter(m => 
    m.tanggalTurunFreezer && m.tanggalTurunFreezer.trim() !== '' && 
    (!m.tanggalFirstPOEsKrim || m.tanggalFirstPOEsKrim.trim() === '')
  ).length;
  const greenCount = filteredMarkers.filter(m => 
    (m.tanggalTurunFreezer && m.tanggalTurunFreezer.trim() !== '' && 
     m.tanggalFirstPOEsKrim && m.tanggalFirstPOEsKrim.trim() !== '') ||
    ((!m.tanggalTurunFreezer || m.tanggalTurunFreezer.trim() === '') && 
     m.tanggalFirstPOEsKrim && m.tanggalFirstPOEsKrim.trim() !== '')
  ).length;



  console.log('统计数据:', {
    total: totalCount,
    gray: grayCount,
    red: redCount,
    green: greenCount
  });

  return (
    <div className="App">
      <div className="map-container">
        {loading && (
          <div className="loading-overlay">
            <div className="loading-content">
              <div className="spinner"></div>
              <p>正在加载地图数据...</p>
            </div>
          </div>
        )}
        
        {error && (
          <div className="error-overlay">
            <div className="error-content">
              <h3>加载失败</h3>
              <p>{error}</p>
              <button onClick={loadData} className="btn btn-primary">重试</button>
            </div>
          </div>
        )}

        {/* 统计信息面板 */}
        <div className="left-panels">
          <div className="info-panel">
            <div className="info-content">
              <h4>🏪 店铺统计</h4>
              <div className="info-stats">
                <div className="stat-item">
                  <span className="stat-value">🏪 {totalCount}</span>
                </div>
                <div className="stat-item">
                   <div className="color-circle green"></div>
                   <span className="stat-value">{greenCount}</span>
                 </div>
                 <div className="stat-item">
                   <div className="color-circle red"></div>
                   <span className="stat-value">{redCount}</span>
                 </div>
                 <div className="stat-item">
                   <div className="color-circle gray"></div>
                   <span className="stat-value">{grayCount}</span>
                 </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右上角控制按钮 */}
        <div className="top-right-controls">
          <button
            onClick={handleTypeFilterChange}
            className="control-btn type-filter-btn"
            title={`当前显示: ${typeFilter === 'all' ? '全部' : typeFilter}`}
          >
            {typeFilter === 'all' ? '全部' : typeFilter === 'Stik' ? 'Stik' : 'Ember'}
          </button>
          
          <button
            onClick={handleManualUpdate}
            disabled={isUpdating}
            className={`control-btn ${isUpdating ? 'updating' : ''}`}
            title="手动同步飞书数据"
          >
            {isUpdating ? '⏳' : '🔄'}
          </button>
          
          <button
            onClick={handleLogout}
            className="control-btn"
            title="退出登录"
          >
            🚪
          </button>
        </div>

        {updateMessage && (
          <div className={`update-message ${updateMessage.includes('❌') ? 'error' : 'success'}`}>
            {updateMessage}
          </div>
        )}

        <MapContainer
          center={[-6.2, 106.8]}
          zoom={10}
          style={{ height: '100vh', width: '100%' }}
        >
          <TileLayer
            key={currentLayer}
            attribution={currentLayerConfig.attribution}
            url={currentLayerConfig.url}
          />
          
          <HeadquartersMarker />
          
          <LocationMarker />

          <LayerControl 
            currentLayer={currentLayer}
            onLayerChange={handleLayerChange}
          />
          
          {/* 订单标记 - 根据类型和状态显示不同颜色 */}
          {filteredMarkers.map((marker, index) => (
            <Marker
              key={`marker-${index}`}
              position={[marker.latitude, marker.longitude]}
              icon={getMarkerIcon(marker)}
            >
              <Popup className="order-popup">
                <div className="order-details">
                  <h4>📋 店铺详情</h4>
                  
                  {/* 基本信息 */}
                  <div className="detail-section">
                    <h5>🏪 基本信息</h5>
                    <div className="detail-row">
                      <strong>👤 店主姓名:</strong> {marker.namaPemilik || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>🏪 门店代码:</strong> {marker.outletCode || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>🏷️ 类型:</strong> {marker.type || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>🏪 店铺类型:</strong> {marker.tokoType || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>📍 状态:</strong> {marker.outletStatus || '无'}
                    </div>
                  </div>

                  {/* 日期信息 */}
                  <div className="detail-section">
                    <h5>📅 日期信息</h5>
                    <div className="detail-row">
                      <strong>📅 加入日期:</strong> {marker.tanggalJoin || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>📝 合同签署:</strong> {marker.contractSign || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>❄️ 冰柜投放日期:</strong> {marker.tanggalTurunFreezer || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>🍦 首次PO冰淇淋日期:</strong> {marker.tanggalFirstPOEsKrim || '无'}
                    </div>
                  </div>

                  {/* 销售数据 */}
                  <div className="detail-section">
                    <h5>📊 销售数据</h5>
                    <div className="detail-row">
                      <strong>📦 每日DUS:</strong> {marker.dusPerDay || '0'}
                    </div>
                    <div className="detail-row">
                      <strong>📊 总DUS:</strong> {marker.totalDUS || '0'}
                    </div>
                    <div className="detail-row">
                      <strong>💰 总价值(IDR):</strong> {marker.totalValueIDR || '0'}
                    </div>
                    <div className="detail-row">
                      <strong>🛒 PO次数:</strong> {marker.poBerapaKali || '0'}
                    </div>
                    <div className="detail-row">
                      <strong>⏰ PO频率:</strong> {marker.poFrequency || '无'}
                    </div>
                  </div>

                  {/* 设备信息 */}
                  <div className="detail-section">
                    <h5>🧊 设备信息</h5>
                    <div className="detail-row">
                      <strong>❄️ 冰柜代码:</strong> {marker.freezerCode || '无'}
                    </div>
                  </div>

                  {/* 营销物料 */}
                  <div className="detail-section">
                    <h5>🎯 营销物料</h5>
                    <div className="detail-row">
                      <strong>🏳️ 横幅:</strong> {marker.spanduk || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>🚩 旗帜挂架:</strong> {marker.flagHanger || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>📄 海报:</strong> {marker.poster || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>💲 价格牌:</strong> {marker.papanHarga || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>🏷️ 价格贴纸:</strong> {marker.stikerHarga || '无'}
                    </div>
                  </div>

                  {/* 服务记录 */}
                  <div className="detail-section">
                    <h5>🔧 服务记录</h5>
                    <div className="detail-row">
                      <strong>🔧 最后服务:</strong> {marker.lastService || '无'}
                    </div>
                    <div className="detail-row">
                      <strong>🧊 最后清理冰花:</strong> {marker.lastBungaEs || '无'}
                    </div>
                  </div>

                  {/* 活动状态 */}
                  {marker.event === '✅' && (
                    <div className="detail-section">
                      <h5>🎉 特殊状态</h5>
                      <div className="detail-row">
                        <strong>🎉 活动状态:</strong> 
                        <span style={{
                          color: '#FFD700',
                          fontWeight: 'bold',
                          marginLeft: '4px'
                        }}>
                          ✅ 有活动
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

// CSV解析函数 - 严格要求25字段格式，正确处理包含逗号的引号字段
const parseCSV = (csvText: string): MarkerData[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  // 正确解析CSV行，处理引号内的逗号
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  };

  const headers = parseCSVLine(lines[0]);
  const markers: MarkerData[] = [];

  console.log('📊 解析25字段数据格式中... (更新时间: ' + new Date().toLocaleString() + ')');
  console.log('📋 CSV头部:', headers);
  console.log('📋 字段数量:', headers.length);

  // 严格检查25字段格式
  if (headers.length < 25) {
    console.error('❌ CSV格式错误：需要25字段格式，当前只有', headers.length, '字段');
    console.error('❌ 期望格式：Outlet Code,Nama Pemilik,Tanggal Join,Type,Toko Type,Event,Contract Sign,Tanggal Turun Freezer,Tanggal First PO EsKrim,DUS per Day,Total Value IDR,Total DUS,PO berapa Kali,PO Frequency,Freezer Code,Spanduk,Flag Hanger,Poster,Papan Harga,Stiker Harga,Last Service,Last Bunga Es,latitude,longitude,Outlet Status');
    return [];
  }

  console.log('✅ 检测到正确的25字段格式');

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    // 严格要求25字段
    if (values.length < 25) {
      console.log(`⚠️ 跳过不完整记录 (第${i+1}行): 只有${values.length}字段，需要25字段`);
      continue;
    }
    
    // 25字段格式：Outlet Code,Nama Pemilik,Tanggal Join,Type,Toko Type,Event,Contract Sign,Tanggal Turun Freezer,Tanggal First PO EsKrim,DUS per Day,Total Value IDR,Total DUS,PO berapa Kali,PO Frequency,Freezer Code,Spanduk,Flag Hanger,Poster,Papan Harga,Stiker Harga,Last Service,Last Bunga Es,latitude,longitude,Outlet Status
    const outletCode = values[0]?.replace(/"/g, '') || '';
    const namaPemilik = values[1]?.replace(/"/g, '') || '';
    const tanggalJoin = values[2]?.replace(/"/g, '') || '';
    const type = values[3]?.replace(/"/g, '') || '';
    const tokoType = values[4]?.replace(/"/g, '') || '';
    const event = values[5]?.replace(/"/g, '') || '';
    const contractSign = values[6]?.replace(/"/g, '') || '';
    const tanggalTurunFreezer = values[7]?.replace(/"/g, '') || '';
    const tanggalFirstPOEsKrim = values[8]?.replace(/"/g, '') || '';
    const dusPerDay = values[9]?.replace(/"/g, '') || '';
    const totalValueIDR = values[10]?.replace(/"/g, '') || '';
    const totalDUS = values[11]?.replace(/"/g, '') || '';
    const poBerapaKali = values[12]?.replace(/"/g, '') || '';
    const poFrequency = values[13]?.replace(/"/g, '') || '';
    const freezerCode = values[14]?.replace(/"/g, '') || '';
    const spanduk = values[15]?.replace(/"/g, '') || '';
    const flagHanger = values[16]?.replace(/"/g, '') || '';
    const poster = values[17]?.replace(/"/g, '') || '';
    const papanHarga = values[18]?.replace(/"/g, '') || '';
    const stikerHarga = values[19]?.replace(/"/g, '') || '';
    const lastService = values[20]?.replace(/"/g, '') || '';
    const lastBungaEs = values[21]?.replace(/"/g, '') || '';
    const latitude = parseFloat(values[22]?.replace(/"/g, '') || '0');
    const longitude = parseFloat(values[23]?.replace(/"/g, '') || '0');
    const outletStatus = values[24]?.replace(/"/g, '') || '';
    
    // 筛选逻辑：Outlet Status = "Active"
    if (outletStatus !== 'Active') {
      console.log(`⚠️ 跳过记录: ${outletCode} - 状态: ${outletStatus}`);
      continue;
    }
    
    if (isNaN(latitude) || isNaN(longitude)) {
      console.log(`⚠️ 跳过无效坐标: ${outletCode}`);
      continue;
    }

    markers.push({
      outletCode,
      namaPemilik,
      tanggalJoin,
      type,
      tokoType,
      event,
      contractSign,
      tanggalTurunFreezer,
      tanggalFirstPOEsKrim,
      dusPerDay,
      totalValueIDR,
      totalDUS,
      poBerapaKali,
      poFrequency,
      freezerCode,
      spanduk,
      flagHanger,
      poster,
      papanHarga,
      stikerHarga,
      lastService,
      lastBungaEs,
      latitude,
      longitude,
      outletStatus
    });
  }

  console.log(`📍 成功解析 ${markers.length} 个符合条件的标记点（Active状态）`);
  return markers;
};

export default App;