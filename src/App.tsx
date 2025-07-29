import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import './App.css';

// 创建自定义深绿色圆形标记图标
const createCustomIcon = (dusPerDay: string, spanduk: string, event: string, tanggalTurunFreezer: string, tanggalFirstPOEsKrim: string) => {
  const dusValue = parseFloat(dusPerDay) || 0;
  const displayValue = dusValue.toFixed(1);
  const showUnderline = spanduk !== "Udah Pasang";
  const isGoldBorder = event === "✅";
  
  // 根据日期字段确定圆圈背景颜色
  let circleColorClass = '';
  const hasFreezerDate = tanggalTurunFreezer && tanggalTurunFreezer.trim() !== '';
  const hasFirstPODate = tanggalFirstPOEsKrim && tanggalFirstPOEsKrim.trim() !== '';
  
  if (hasFreezerDate && hasFirstPODate) {
    circleColorClass = 'circle-green'; // 深绿色
  } else if (!hasFreezerDate && hasFirstPODate) {
    circleColorClass = 'circle-green'; // 深绿色
  } else if (hasFreezerDate && !hasFirstPODate) {
    circleColorClass = 'circle-red'; // 深红色
  } else {
    circleColorClass = 'circle-gray'; // 灰色
  }
  
  return L.divIcon({
    className: 'custom-marker',
    html: `<div class="marker-circle ${circleColorClass} ${isGoldBorder ? 'gold-border' : ''}"><span class="dus-text ${showUnderline ? 'with-underline' : ''}">${displayValue}</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
};

// 修复 Leaflet 默认图标问题（备用）
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MarkerData {
  outletCode: string;
  namaPemilik: string;
  tanggalJoin: string;
  type: string;
  tokoType: string;
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
  outletStatus: string;
}

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [greenCount, setGreenCount] = useState(0);
  const [redCount, setRedCount] = useState(0);
  const [grayCount, setGrayCount] = useState(0);
  const [activeMarkers, setActiveMarkers] = useState<MarkerData[]>([]);
  const [filteredMarkers, setFilteredMarkers] = useState<MarkerData[]>([]);
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'red' | 'gray'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Stik' | 'Ember'>('all');
  const [isSatelliteView, setIsSatelliteView] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const mapRef = useRef<any>(null);

  // 获取标记的颜色类型
  const getMarkerColorType = (marker: MarkerData): 'green' | 'red' | 'gray' => {
    const hasFreezerDate = marker.tanggalTurunFreezer && marker.tanggalTurunFreezer.trim() !== '';
    const hasFirstPODate = marker.tanggalFirstPOEsKrim && marker.tanggalFirstPOEsKrim.trim() !== '';
    
    if (hasFreezerDate && hasFirstPODate) {
      return 'green';
    } else if (!hasFreezerDate && hasFirstPODate) {
      return 'green';
    } else if (hasFreezerDate && !hasFirstPODate) {
      return 'red';
    } else {
      return 'gray';
    }
  };

  // 过滤标记
  const filterMarkers = useCallback(() => {
    let filtered = activeMarkers;
    
    // 按类型过滤
    if (typeFilter !== 'all') {
      filtered = filtered.filter(marker => marker.type === typeFilter);
    }
    
    // 按颜色过滤
    if (colorFilter !== 'all') {
      filtered = filtered.filter(marker => {
        const colorType = getMarkerColorType(marker);
        return colorType === colorFilter;
      });
    }
    
    setFilteredMarkers(filtered);
  }, [activeMarkers, colorFilter, typeFilter]);

  // 处理统计项点击
  const handleStatItemClick = (filterType: 'all' | 'green' | 'red' | 'gray') => {
    setColorFilter(filterType);
  };

  // 处理Type切换按钮点击
  const handleTypeFilterClick = () => {
    if (typeFilter === 'all') {
      setTypeFilter('Stik');
    } else if (typeFilter === 'Stik') {
      setTypeFilter('Ember');
    } else {
      setTypeFilter('all');
    }
  };

  // 当activeMarkers或colorFilter变化时，重新过滤
  useEffect(() => {
    filterMarkers();
  }, [filterMarkers]);

  // 定位功能
  const handleLocationClick = () => {
    if (!navigator.geolocation) {
      alert('您的浏览器不支持地理定位功能');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newLocation: [number, number] = [latitude, longitude];
        setUserLocation(newLocation);
        
        // 将地图中心移动到用户位置
        if (mapRef.current) {
          mapRef.current.setView(newLocation, 15);
        }
        setIsLocating(false);
      },
      (error) => {
        console.error('定位失败:', error);
        let errorMessage = '定位失败，请检查您的位置权限设置';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = '定位权限被拒绝，请在浏览器设置中允许位置访问';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = '位置信息不可用';
            break;
          case error.TIMEOUT:
            errorMessage = '定位请求超时';
            break;
        }
        alert(errorMessage);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // 超强力缓存清理功能 - 彻底禁用所有缓存
  useEffect(() => {
    const forceNoCacheReload = () => {
      // 强制重新加载页面，绕过所有缓存
      if (process.env.NODE_ENV === 'development') {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('_t', Date.now().toString());
        currentUrl.searchParams.set('_nocache', 'true');
        window.history.replaceState({}, '', currentUrl.toString());
      }
    };
    
    const clearAllCaches = async () => {
      try {
        // 清理Service Worker缓存
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
        
        // 清理所有存储
        if (typeof Storage !== 'undefined') {
          localStorage.clear();
          sessionStorage.clear();
        }
        
        // 清理IndexedDB
        if ('indexedDB' in window) {
          try {
            const databases = await indexedDB.databases();
            databases.forEach(db => {
              if (db.name) {
                indexedDB.deleteDatabase(db.name);
              }
            });
          } catch (e) {
            console.log('IndexedDB清理失败:', e);
          }
        }
        
        // 强制刷新所有资源
        forceNoCacheReload();
      } catch (error) {
        console.log('缓存清理过程中出现错误:', error);
      }
    };
    
    // 立即执行缓存清理
    clearAllCaches();
    
    // 添加强制无缓存头部
    const addNoCacheHeaders = () => {
      const timestamp = Date.now();
      
      // 处理所有CSS文件
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      links.forEach((link: any) => {
        const url = new URL(link.href);
        url.searchParams.set('v', timestamp.toString());
        url.searchParams.set('nocache', 'true');
        link.href = url.toString();
      });
      
      // 处理所有JS文件
      const scripts = document.querySelectorAll('script[src]');
      scripts.forEach((script: any) => {
        if (script.src && !script.src.includes('localhost')) {
          const url = new URL(script.src);
          url.searchParams.set('v', timestamp.toString());
          url.searchParams.set('nocache', 'true');
          script.src = url.toString();
        }
      });
    };
    
    addNoCacheHeaders();
    
    // 监听所有可能的缓存触发事件
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // 页面从缓存中恢复，强制重新加载
        window.location.reload();
      }
    };
    
    const handleFocus = () => {
      clearAllCaches();
    };
    
    const handleBeforeUnload = () => {
      clearAllCaches();
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        clearAllCaches();
      }
    };
    
    // 添加所有事件监听器
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 更频繁的缓存清理（每10秒）
    const intervalId = setInterval(() => {
      clearAllCaches();
      addNoCacheHeaders();
    }, 10000);
    
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, []);

  // 解析CSV数据
  const parseCSV = (csvText: string): MarkerData[] => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(header => header.replace(/"/g, '').trim());
    
    const data: MarkerData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      // 简单的CSV解析（处理引号）
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      if (values.length >= headers.length) {
        const marker: MarkerData = {
          outletCode: values[0] || '',
          namaPemilik: values[1] || '',
          tanggalJoin: values[2] || '',
          type: values[3] || '',
          tokoType: values[4] || '',
          event: values[5] || '',
          contractSign: values[6] || '',
          tanggalTurunFreezer: values[7] || '',
          tanggalFirstPOEsKrim: values[8] || '',
          dusPerDay: values[9] || '',
          totalValueIDR: values[10] || '',
          totalDUS: values[11] || '',
          poBerapaKali: values[12] || '',
          poFrequency: values[13] || '',
          freezerCode: values[14] || '',
          spanduk: values[15] || '',
          flagHanger: values[16] || '',
          poster: values[17] || '',
          papanHarga: values[18] || '',
          stikerHarga: values[19] || '',
          lastService: values[20] || '',
          lastBungaEs: values[21] || '',
          latitude: parseFloat(values[22]) || 0,
          longitude: parseFloat(values[23]) || 0,
          outletStatus: values[24] || ''
        };
        data.push(marker);
      }
    }
    
    return data;
  };

  // 加载CSV数据
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 从Netlify部署的静态文件读取CSV数据（通过GitHub授权同步）
      const timestamp = new Date().getTime();
      const response = await fetch(`/markers.csv?t=${timestamp}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`加载数据失败: ${response.status}`);
      }
      
      const csvText = await response.text();
      const processedMarkers = parseCSV(csvText);
      
      setTotalCount(processedMarkers.length);
      
      // 统计状态为Active的数据
      const activeMarkersData = processedMarkers.filter(marker => 
        marker.outletStatus.toLowerCase() === 'active'
      );
      
      // 根据当前类型过滤器计算统计数据
      const calculateStats = (markers: MarkerData[]) => {
        let filteredForStats = markers;
        if (typeFilter !== 'all') {
          filteredForStats = markers.filter(marker => marker.type === typeFilter);
        }
        
        setTotalCount(filteredForStats.length);
        
        let greenCountTemp = 0;
        let redCountTemp = 0;
        let grayCountTemp = 0;
        
        filteredForStats.forEach(marker => {
          const hasFreezerDate = marker.tanggalTurunFreezer && marker.tanggalTurunFreezer.trim() !== '';
          const hasFirstPODate = marker.tanggalFirstPOEsKrim && marker.tanggalFirstPOEsKrim.trim() !== '';
          
          if (hasFreezerDate && hasFirstPODate) {
            greenCountTemp++; // 深绿色
          } else if (!hasFreezerDate && hasFirstPODate) {
            greenCountTemp++; // 深绿色
          } else if (hasFreezerDate && !hasFirstPODate) {
            redCountTemp++; // 深红色
          } else {
            grayCountTemp++; // 灰色
          }
        });
        
        setGreenCount(greenCountTemp);
        setRedCount(redCountTemp);
        setGrayCount(grayCountTemp);
      };
      
      calculateStats(activeMarkersData);
      setActiveMarkers(activeMarkersData);
      
    } catch (error) {
      console.error('加载数据失败:', error);
      setError('加载数据失败，请检查数据文件');
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  // 手动刷新数据
  const handleRefresh = () => {
    loadData();
  };

  // 同步飞书数据
  const [isSyncing, setIsSyncing] = useState(false);
  const handleSyncData = async () => {
    try {
      setIsSyncing(true);
      setError(null);
      
      // 调用后端API触发飞书数据同步
      const response = await fetch('https://outlet-sync-service.onrender.com/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`同步失败: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('同步结果:', result);
      
      // 等待一段时间让数据更新完成，然后重新加载
      setTimeout(() => {
        loadData();
      }, 3000);
      
    } catch (error) {
      console.error('同步数据失败:', error);
      setError('同步数据失败，请稍后重试');
    } finally {
      setIsSyncing(false);
    }
  };

  // 组件加载时获取数据
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 当类型过滤器改变时重新计算统计数据
  useEffect(() => {
    if (activeMarkers.length > 0) {
      let filteredForStats = activeMarkers;
      if (typeFilter !== 'all') {
        filteredForStats = activeMarkers.filter(marker => marker.type === typeFilter);
      }
      
      setTotalCount(filteredForStats.length);
      
      let greenCountTemp = 0;
      let redCountTemp = 0;
      let grayCountTemp = 0;
      
      filteredForStats.forEach(marker => {
        const hasFreezerDate = marker.tanggalTurunFreezer && marker.tanggalTurunFreezer.trim() !== '';
        const hasFirstPODate = marker.tanggalFirstPOEsKrim && marker.tanggalFirstPOEsKrim.trim() !== '';
        
        if (hasFreezerDate && hasFirstPODate) {
          greenCountTemp++; // 深绿色
        } else if (!hasFreezerDate && hasFirstPODate) {
          greenCountTemp++; // 深绿色
        } else if (hasFreezerDate && !hasFirstPODate) {
          redCountTemp++; // 深红色
        } else {
          grayCountTemp++; // 灰色
        }
      });
      
      setGreenCount(greenCountTemp);
      setRedCount(redCountTemp);
      setGrayCount(grayCountTemp);
    }
  }, [typeFilter, activeMarkers]);

  return (
    <div className="App">
      {/* 左上角统计面板 */}
      <div className="stats-panel">
        <div className="panel-header">
          <h2>店铺统计</h2>
          <div className="button-group">
            <button 
              onClick={handleRefresh} 
              disabled={loading}
              className="refresh-btn-small"
              title="刷新地图数据"
            >
              {loading ? '⏳' : '🔄'}
            </button>
            <button 
              onClick={handleSyncData} 
              disabled={isSyncing || loading}
              className="sync-btn-small"
              title="从飞书同步最新数据"
            >
              {isSyncing ? '⏳' : '🔄📊'}
            </button>
          </div>
        </div>
        
        {error && (
          <div className="error-message-small">
            ❌ 加载失败
          </div>
        )}
        
        <div className="stats-grid">
          <div 
            className={`stat-item ${colorFilter === 'all' ? 'active' : ''}`}
            onClick={() => handleStatItemClick('all')}
          >
            <div className="stat-number-small">{totalCount}</div>
            <div className="stat-label-small">总店铺</div>
          </div>
          
          <div 
            className={`stat-item green ${colorFilter === 'green' ? 'active' : ''}`}
            onClick={() => handleStatItemClick('green')}
          >
            <div className="stat-number-small">{greenCount}</div>
            <div className="stat-label-small">绿色圆圈</div>
          </div>
          
          <div 
            className={`stat-item red ${colorFilter === 'red' ? 'active' : ''}`}
            onClick={() => handleStatItemClick('red')}
          >
            <div className="stat-number-small">{redCount}</div>
            <div className="stat-label-small">红色圆圈</div>
          </div>
          
          <div 
            className={`stat-item gray ${colorFilter === 'gray' ? 'active' : ''}`}
            onClick={() => handleStatItemClick('gray')}
          >
            <div className="stat-number-small">{grayCount}</div>
            <div className="stat-label-small">灰色圆圈</div>
          </div>
        </div>
      </div>

      {/* 全屏地图 */}
      {activeMarkers.length > 0 && (
        <div className="fullscreen-map">
          <MapContainer
            center={[-6.1157, 106.9216]}
            zoom={12}
            style={{ height: '100vh', width: '100vw' }}
            ref={mapRef}
            zoomControl={false}
          >
            <TileLayer
              url={isSatelliteView 
                ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
              attribution={isSatelliteView
                ? '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              }
            />
            
            {/* 地图控制按钮组 */}
            <div className="map-controls">
              <button 
                className={`type-filter-btn ${typeFilter === 'all' ? 'all' : typeFilter === 'Stik' ? 'stik' : 'ember'}`}
                onClick={() => handleTypeFilterClick()}
                title={`当前显示: ${typeFilter === 'all' ? '全部店铺' : typeFilter === 'Stik' ? 'Stik店铺' : 'Ember店铺'}`}
              >
                {typeFilter === 'all' ? '🏪' : typeFilter === 'Stik' ? '🍡' : '🍨'}
              </button>
              
              <button 
                className={`view-toggle-btn ${isSatelliteView ? 'satellite' : 'map'}`}
                onClick={() => setIsSatelliteView(!isSatelliteView)}
                title={isSatelliteView ? '切换到地图视图' : '切换到卫星视图'}
              >
                {isSatelliteView ? '🗺️' : '🛰️'}
              </button>
              
              <button 
                className={`location-btn ${isLocating ? 'locating' : ''}`}
                onClick={handleLocationClick}
                disabled={isLocating}
                title="定位我的位置"
              >
                📍
              </button>
            </div>
            
            {/* 用户位置标记 */}
            {userLocation && (
              <Marker
                position={userLocation}
                icon={L.divIcon({
                  className: 'user-location-marker',
                  html: '<div class="user-location-circle"></div>',
                  iconSize: [24, 24],
                  iconAnchor: [12, 12],
                  popupAnchor: [0, -12]
                })}
              >
                <Popup>
                  <div className="popup-content">
                    <h4>📍 您的位置</h4>
                    <p><strong>纬度:</strong> {userLocation[0].toFixed(6)}</p>
                    <p><strong>经度:</strong> {userLocation[1].toFixed(6)}</p>
                  </div>
                </Popup>
              </Marker>
            )}
            {filteredMarkers.map((marker, index) => (
              <Marker
                key={index}
                position={[marker.latitude, marker.longitude]}
                icon={createCustomIcon(marker.dusPerDay, marker.spanduk, marker.event, marker.tanggalTurunFreezer, marker.tanggalFirstPOEsKrim)}
              >
                <Popup maxWidth={350} maxHeight={400}>
                  <div className="popup-content-detailed">
                    <h4>{marker.namaPemilik}</h4>
                    
                    <div className="popup-section">
                       <h5>📋 基本信息</h5>
                       <p><strong>店铺代码:</strong> {marker.outletCode}</p>
                       <p><strong>类型:</strong> {marker.type}</p>
                       <p><strong>店铺类型:</strong> {marker.tokoType}</p>
                       <p><strong>加入日期:</strong> {marker.tanggalJoin}</p>
                     </div>

                    <div className="popup-section">
                      <h5>📅 重要日期</h5>
                      {marker.contractSign && <p><strong>合同签署:</strong> {marker.contractSign}</p>}
                      {marker.tanggalTurunFreezer && <p><strong>冰柜下放日期:</strong> {marker.tanggalTurunFreezer}</p>}
                      {marker.tanggalFirstPOEsKrim && <p><strong>首次订购冰淇淋:</strong> {marker.tanggalFirstPOEsKrim}</p>}
                      {marker.lastService && <p><strong>最后服务:</strong> {marker.lastService}</p>}
                      {marker.lastBungaEs && <p><strong>最后冰花:</strong> {marker.lastBungaEs}</p>}
                    </div>

                    <div className="popup-section">
                      <h5>📊 销售数据</h5>
                      {marker.dusPerDay && <p><strong>每日销量:</strong> {marker.dusPerDay} DUS</p>}
                      {marker.totalValueIDR && <p><strong>总价值(IDR):</strong> {marker.totalValueIDR}</p>}
                      {marker.totalDUS && <p><strong>总DUS:</strong> {marker.totalDUS}</p>}
                      {marker.poBerapaKali && <p><strong>订购次数:</strong> {marker.poBerapaKali}</p>}
                      {marker.poFrequency && <p><strong>订购频率:</strong> {marker.poFrequency}</p>}
                    </div>

                    <div className="popup-section">
                      <h5>🛠️ 设备与物料</h5>
                      {marker.freezerCode && <p><strong>冰柜代码:</strong> {marker.freezerCode}</p>}
                      {marker.spanduk && <p><strong>横幅:</strong> {marker.spanduk}</p>}
                      {marker.flagHanger && <p><strong>旗帜挂架:</strong> {marker.flagHanger}</p>}
                      {marker.poster && <p><strong>海报:</strong> {marker.poster}</p>}
                      {marker.papanHarga && <p><strong>价格牌:</strong> {marker.papanHarga}</p>}
                      {marker.stikerHarga && <p><strong>价格贴纸:</strong> {marker.stikerHarga}</p>}
                    </div>

                    {marker.event && (
                      <div className="popup-section">
                        <h5>🎉 活动信息</h5>
                        <p><strong>活动:</strong> {marker.event}</p>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

export default App;