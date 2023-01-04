const Koa = require("koa");
const Router = require("koa-router");
const koaBody = require("koa-body");
const path = require("path");
const fse = require("fs-extra");

const app = new Koa();
const router = new Router();
const UPLOAD_DIR = path.resolve(__dirname, "public");

app.use(
  koaBody({
    multipart: true, // 支持文件上传
  })
);

router.post("/checkfile", async (ctx) => {
  const body = ctx.request.body;
  console.log(body);
  const { ext, hash } = body;
  const filePath = path.resolve(UPLOAD_DIR, `${hash}.${ext}`);
  let uploaded = false;
  let uploadedList = [];

  if (fse.existsSync(filePath)) {
    uploaded = true;
  } else {
    uploadedList = await getUploadedList(path.resolve(UPLOAD_DIR, hash));
  }
  ctx.body = {
    code: 0,
    data: {
      uploaded, // 是否存在该文件
      uploadedList, // 已上传的切片数组
    },
  };
});

/**
 * @description: 获取目录下已上传的切片数组
 * @param {*} dirPath
 */
async function getUploadedList(dirPath) {
  return fse.existsSync(dirPath)
    ? (await fse.readdir(dirPath)).filter((name) => name[0] !== ".")
    : [];
}

router.post("/uploadfile", async (ctx) => {
  const body = ctx.request.body;
  const file = ctx.request.files.chunk;
  // console.log('上传接收到的：body：',body);
  
  const { hash, name, totalBlock } = body;

  const chunkPath = path.resolve(UPLOAD_DIR, hash);
  if (!fse.existsSync(chunkPath)) {
    await fse.mkdir(chunkPath);
  }

  // uploadedList = await getUploadedList(chunkPath);

  // if (uploadedList.length == totalBlock) {
  //   return (ctx.body = {
  //     code: -1,
  //     message: `所有切片已上传`,
  //   });
  // }

  await fse.move(file.filepath, `${chunkPath}/${name}`);

  ctx.body = {
    code: 0,
    message: `切片上传成功`,
  };
});

/**
 * @description: 合并所有切片
 * @param {*} ext 文件扩展名
 * @param {*} size 设定的切片大小
 * @param {*} hash 文件的hash值
 */
router.post("/mergeFile", async (ctx) => {
  const body = ctx.request.body;
  const { ext, size, hash } = body;
  // 文件最终路径
  const filePath = path.resolve(UPLOAD_DIR, `${hash}.${ext}`);
  await mergeFile(filePath, size, hash);
  ctx.body = {
    code: 0,
    data: {
      url: `/public/${hash}.${ext}`,
    },
  };
});

/**
 * @description: 读取所有切片数据，并排序
 * @param {*} filePath 文件最终路径
 */
async function mergeFile(filePath, size, hash) {
  // 1. 读取所有切片
  const chunkDir = path.resolve(UPLOAD_DIR, hash);
  let chunks = await fse.readdir(chunkDir);
  // 2. 排序切片，得到切片地址数组
  chunks = chunks.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
  chunks = chunks.map((cpath) => path.resolve(chunkDir, cpath));
  await mergeChunks(chunks, filePath, size);
}

function mergeChunks(files, dest, CHUNK_SIZE) {
  /**
   * @description: 
   * @param {*} filePath 切片地址
   * @param {*} writeStream 切片写入目标信息实例
   */  
  const pipeStream = (filePath, writeStream) => {
    return new Promise((resolve, reject) => {
      // 读取切片数据
      const readStream = fse.createReadStream(filePath);
      // 读取完成删除切片
      readStream.on("end", () => {
        fse.unlinkSync(filePath);
        resolve();
      });
      // 切片数据拼接到目标地址中，用于合并生成新的文件
      readStream.pipe(writeStream);
    });
  };

  const pipes = files.map((file, index) => {
    return pipeStream(
      file,
      fse.createWriteStream(dest, {
        start: index * CHUNK_SIZE,
        end: (index + 1) * CHUNK_SIZE,
      })
    );
  });
  return Promise.all(pipes);
}

app.use(router.routes());
app.listen(7001, () => {
  console.log("server running at 7001");
});
