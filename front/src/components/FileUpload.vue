<template>
  <div class="wrap">
    <div>
      <el-upload
        ref="file"
        :http-request="handleFileUpload"
        action="#"
        class="avatar-uploader"
        :show-file-list="false"
      >
        <el-button type="primary">上传文件</el-button>
      </el-upload>
      <div style="width: 80%; padding-top: 20px; margin: 0 auto">
        <div>计算hash的进度：</div>
        <el-progress
          :stroke-width="20"
          :text-inside="true"
          :percentage="hashProgress"
        ></el-progress>
      </div>
      <div style="width: 80%; padding-top: 20px; margin: 0 auto">
        <div>上传进度：</div>
        <el-progress
          :stroke-width="20"
          :text-inside="true"
          :percentage="uploaedProgress"
        ></el-progress>
      </div>
      <h3>切片上传进度：</h3>
      <div class="container" :style="{ width: cubeWidth + 'px' }">
        <div class="cube" v-for="chunk in chunks" :key="chunk.name">
          <div
            :class="{
              uploading: chunk.progress > 0 && chunk.progress < 100,
              success: chunk.progress == 100,
              error: chunk.progress < 0,
            }"
            :style="{ height: chunk.progress + '%' }"
          >
            <i
              class="el-icon-loading"
              :style="{ color: '#f56c6c' }"
              v-if="chunk.progress < 100 && chunk.progress > 0"
            ></i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  createFileChunk,
  calculateHash,
  splicingUploadParams,
  startUpload,
} from "./uploadMaxFile";
// 切片大小
const CHUNK_SIZE = 8 * 1024 * 1024;

export default {
  name: "file-upload",
  data() {
    return {
      file: null, // 要上传的文件
      chunks: [], // 切片数组
      hashProgress: 0, // hash 进度
      hash: "", // 整个文件对应的hash值
    };
  },
  computed: {
    // 上传进度
    uploaedProgress() {
      if (!this.file || !this.chunks.length) {
        return 0;
      }
      const loaded = this.chunks
        .map((e) => {
          const size = e.chunk.size;
          const chunk_loaded = (e.progress / 100) * size;
          return chunk_loaded;
        })
        .reduce((acc, cur) => acc + cur, 0);

      return parseInt(((loaded * 100) / this.file.size).toFixed(2));
    },
    // 切片元素宽度
    cubeWidth() {
      return Math.ceil(Math.sqrt(this.chunks.length)) * 20;
    },
  },

  methods: {
    /**
     * @description: 自定义处理要上传的文件
     * @param {*} e
     */
    async handleFileUpload(e) {
      console.log("① 要上传的文件：", e);
      const { file = null } = e;
      if (!file) {
        return;
      }
      this.file = file;
      this.upload();
    },
    /**
     * @description: 开始切片上传
     */
    async upload() {
      // 根据文件大小计算切片长度
      const chunksTemp = createFileChunk(this.file);
      console.log("② 切片长度计算完成：", chunksTemp);
      // 根据切片长度进行切片 、 对整个文件进行hash
      const self = this;
      const hash = await calculateHash(chunksTemp, (progress) => {
        self.hashProgress = progress;
      });
      this.hash = hash;
      console.log("③ 要上传文件hash映射值：", hash);
      // 查询是否上传,或者是否继续断点上传
      this.$http
        .post("/checkfile", {
          hash,
          ext: this.file.name.split(".").pop(),
        })
        .then((res) => {
          if (!res || !res.data) {
            return;
          }
          const { uploaded, uploadedList } = res.data;
          if (uploaded) {
            console.log("④ 文件已存在，无需上传");
            return this.$message.success("秒传成功");
          }
          // 组装上传数据
          const { chunks, requests } = splicingUploadParams(
            chunksTemp,
            this.hash,
            uploadedList
          );
          // 将拼接后的切片数据赋值给原始数据
          this.chunks = chunks;
          // 上传需要上传的切片信息
          this.uploadChunks(requests);
        });
    },
    /**
     * @description: 上传需要上传的切片信息
     * @param {*} requests
     */
    async uploadChunks(requests) {
      console.log("需要上传的切片：", requests);
      // 并发，发送切片请求 3 代表一次并发3个请求上传
      startUpload("/uploadfile", this.chunks, requests, 3).then(() => {
        console.log("所有切片上传完成✅");
        this.mergeFile();
      });
    },
    /**
     * @description: 发送合并请求
     */
    mergeFile() {
      this.$http
        .post("/mergeFile", {
          ext: this.file.name.split(".").pop(),
          size: CHUNK_SIZE,
          hash: this.hash,
        })
        .then((res) => {
          if (res && res.data) {
            console.log(res.data);
          }
        });
    },
  },
};
</script>

<style scoped lang="scss">
.wrapBox {
  position: relative;
}
#block {
  width: 100px;
  height: 100px;
  background: red;
  position: absolute;
}
.container {
  display: flex;
  flex-wrap: wrap;
  margin: 20px auto;
  .cube {
    width: 18px;
    height: 18px;
    border: 1px solid #000;
    background-color: #eee;
    .success {
      background: green;
    }
    .uploading {
      background: blue;
    }
    .error {
      background: red;
    }
  }
}
</style>
