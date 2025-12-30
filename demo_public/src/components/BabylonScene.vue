<template>
  <div class="w-100vw h-100vh">
    <canvas ref="canvasRef" class="w-full h-full"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import '@babylonjs/loaders'; // 导入资源管理器
import * as BABYLON from '@babylonjs/core';

const url = 'http://localhost:5173/306_308.glb'
const canvasRef = ref(null)

// 初始化BabylonJS场景
const initScene = async () => {
  const engine = new BABYLON.Engine(canvasRef.value); // 创建渲染引擎
  engine.setHardwareScalingLevel(1);
  const scene = new BABYLON.Scene(engine); // 创建场景
  // 创建弧形旋转摄像机
  const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 2, 3, new BABYLON.Vector3(0, 20, 30), scene);
  camera.attachControl(canvasRef.value, true);
  camera.setTarget(new BABYLON.Vector3(0, 0, 0));
  new BABYLON.DirectionalLight('平行光', new BABYLON.Vector3(0, -1, -1), scene); // 创建灯光

  
// 1. 环境光 - 提供基础照明，避免完全黑暗的区域
  const ambientLight = new BABYLON.HemisphericLight('环境光', new BABYLON.Vector3(0, 1, 0), scene);
  ambientLight.intensity = 0.7; // 环境光强度
  ambientLight.groundColor = new BABYLON.Color3(0.2, 0.2, 0.2); // 地面反射光
  
  // 2. 主光源 - 模拟太阳光
  const mainLight = new BABYLON.DirectionalLight('主光源', new BABYLON.Vector3(-1, -1, -1), scene);
  mainLight.position = new BABYLON.Vector3(20, 40, 20);
  mainLight.intensity = 1.2;
  
  // 3. 补光 - 减少阴影的黑暗程度
  const fillLight = new BABYLON.DirectionalLight('补光', new BABYLON.Vector3(1, -0.5, 1), scene);
  fillLight.position = new BABYLON.Vector3(-20, 20, -20);
  fillLight.intensity = 0.5;
  
  // 4. 点光源 - 提供局部照明效果
  const pointLight = new BABYLON.PointLight('点光源', new BABYLON.Vector3(0, 15, 0), scene);
  pointLight.intensity = 0.5;
  pointLight.radius = 20;
  
  // 启用阴影生成
  const shadowGenerator = new BABYLON.ShadowGenerator(1024, mainLight);
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.blurKernel = 32;
  shadowGenerator.transparencyShadow = true;


  engine.runRenderLoop(() => {
    scene.render();
  });
  const container = await BABYLON.LoadAssetContainerAsync(url, scene);
  if (container) {
    container.addAllToScene();
  }
}

// 窗口大小改变时调整画布
const handleResize = () => {
  if (engine) {
    engine.resize()
  }
}

onMounted(() => {
  initScene()
})

onUnmounted(() => {
  if (engine) {
    engine.dispose()
  }
})
</script>

<style scoped>
:deep(canvas) {
  touch-action: none;
}
</style>